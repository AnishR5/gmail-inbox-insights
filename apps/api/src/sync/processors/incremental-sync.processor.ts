import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Queue, Worker } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { bullmqConnection } from "../bullmq-connection";
import { GmailClientService, GMAIL_COST, NeedsReauthError } from "../gmail-client.service";
import { SenderAggregateService } from "../sender-aggregate.service";
import { MessageUpsertService } from "../message-upsert.service";
import { callGmailWithRetry } from "../gmail-retry";
import { reconcileStalledSyncJob } from "../reconcile-stalled-job";
import { DEFAULT_JOB_OPTS, QUEUE_FULL_SYNC, QUEUE_INCREMENTAL_SYNC, type FullSyncJobData, type IncrementalSyncJobData } from "../queues";
import { FULL_SYNC_QUEUE } from "../sync-queues.module";

interface GaxiosLikeError {
  response?: { status?: number };
}

@Injectable()
export class IncrementalSyncProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncrementalSyncProcessor.name);
  private worker?: Worker<IncrementalSyncJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailClient: GmailClientService,
    private readonly senderAggregate: SenderAggregateService,
    private readonly messageUpsert: MessageUpsertService,
    @Inject(FULL_SYNC_QUEUE) private readonly fullSyncQueue: Queue<FullSyncJobData>,
  ) {}

  onModuleInit() {
    this.worker = new Worker<IncrementalSyncJobData>(
      QUEUE_INCREMENTAL_SYNC,
      (job) => this.run(job),
      { connection: bullmqConnection(), concurrency: 2 },
    );
    this.worker.on("failed", async (job, err) => {
      this.logger.error(`Incremental sync job ${job?.id} failed: ${err.message}`);
      if (!job) return;
      if ((await job.getState()) !== "failed") return; // BullMQ is retrying this attempt via backoff
      await reconcileStalledSyncJob(this.prisma, job.data.syncJobId, job.data.mailboxAccountId, err.message);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async run(job: Job<IncrementalSyncJobData>): Promise<void> {
    const { syncJobId, mailboxAccountId } = job.data;
    const mailbox = await this.prisma.mailboxAccount.findUniqueOrThrow({ where: { id: mailboxAccountId } });

    if (!mailbox.historyId) {
      // No baseline yet — fall back to a full sync instead of failing.
      await this.prisma.syncJob.update({
        where: { id: syncJobId },
        data: { status: "completed", finishedAt: new Date(), stats: { note: "no baseline historyId, queued full sync" } },
      });
      await this.enqueueFullSync(mailboxAccountId);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.syncJob.update({ where: { id: syncJobId }, data: { status: "running", startedAt: new Date() } }),
      this.prisma.mailboxAccount.update({
        where: { id: mailboxAccountId },
        data: { syncStatus: "syncing", syncError: null },
      }),
    ]);

    let added = 0;
    let deleted = 0;
    let labelChanged = 0;

    try {
      const gmail = await this.gmailClient.forMailbox(mailboxAccountId);
      let pageToken: string | undefined;
      let latestHistoryId = mailbox.historyId;

      do {
        await this.gmailClient.acquireQuota(mailboxAccountId, GMAIL_COST.HISTORY_LIST);
        const historyRes = await callGmailWithRetry(() =>
          gmail.users.history.list({
            userId: "me",
            startHistoryId: mailbox.historyId!,
            pageToken,
            historyTypes: ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
          }),
        );

        for (const record of historyRes.data.history ?? []) {
          for (const added_ of record.messagesAdded ?? []) {
            if (!added_.message?.id) continue;
            await this.gmailClient.acquireQuota(mailboxAccountId, GMAIL_COST.GET);
            const msgRes = await callGmailWithRetry(() =>
              gmail.users.messages.get({ userId: "me", id: added_.message!.id!, format: "metadata", metadataHeaders: ["From", "Subject"] }),
            );
            await this.messageUpsert.upsertFromMetadata(mailboxAccountId, msgRes.data);
            added++;
          }
          for (const deleted_ of record.messagesDeleted ?? []) {
            if (!deleted_.message?.id) continue;
            await this.messageUpsert.delete(deleted_.message.id);
            deleted++;
          }
          for (const labelRecord of [...(record.labelsAdded ?? []), ...(record.labelsRemoved ?? [])]) {
            if (!labelRecord.message?.id) continue;
            await this.gmailClient.acquireQuota(mailboxAccountId, GMAIL_COST.GET);
            const msgRes = await callGmailWithRetry(() =>
              gmail.users.messages.get({ userId: "me", id: labelRecord.message!.id!, format: "metadata", metadataHeaders: ["From", "Subject"] }),
            );
            await this.messageUpsert.upsertFromMetadata(mailboxAccountId, msgRes.data);
            labelChanged++;
          }
        }

        latestHistoryId = historyRes.data.historyId ?? latestHistoryId;
        pageToken = historyRes.data.nextPageToken ?? undefined;

        // Mirrors FullSyncProcessor's per-page stats update: the "Syncing…"
        // banner reads stats.messagesSynced while running, and without this
        // it stays null (and the banner stuck at 0) for the whole job.
        await this.prisma.syncJob.update({
          where: { id: syncJobId },
          data: { stats: { messagesSynced: added + labelChanged } },
        });
      } while (pageToken);

      await this.senderAggregate.recompute(mailboxAccountId);

      await this.prisma.$transaction([
        this.prisma.syncJob.update({
          where: { id: syncJobId },
          data: { status: "completed", finishedAt: new Date(), stats: { added, deleted, labelChanged } },
        }),
        this.prisma.mailboxAccount.update({
          where: { id: mailboxAccountId },
          data: { syncStatus: "idle", lastSyncedAt: new Date(), historyId: latestHistoryId },
        }),
      ]);
    } catch (err) {
      const status = (err as GaxiosLikeError).response?.status;
      if (status === 410) {
        // historyId too old / expired: only a full resync can recover.
        await this.prisma.syncJob.update({
          where: { id: syncJobId },
          data: { status: "completed", finishedAt: new Date(), stats: { note: "historyId expired (410), queued full sync" } },
        });
        await this.prisma.mailboxAccount.update({ where: { id: mailboxAccountId }, data: { syncStatus: "idle" } });
        await this.enqueueFullSync(mailboxAccountId);
        return;
      }

      const message = (err as Error).message;
      await this.prisma.syncJob.update({
        where: { id: syncJobId },
        data: { status: "failed", finishedAt: new Date(), error: message },
      });
      if (!(err instanceof NeedsReauthError)) {
        await this.prisma.mailboxAccount.update({
          where: { id: mailboxAccountId },
          data: { syncStatus: "error", syncError: message },
        });
      }
      throw err;
    }
  }

  private async enqueueFullSync(mailboxAccountId: string) {
    const newSyncJob = await this.prisma.syncJob.create({ data: { mailboxAccountId, type: "full" } });
    await this.fullSyncQueue.add(
      QUEUE_FULL_SYNC,
      { syncJobId: newSyncJob.id, mailboxAccountId },
      DEFAULT_JOB_OPTS,
    );
  }
}
