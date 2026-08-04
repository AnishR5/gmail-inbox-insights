import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { bullmqConnection } from "../bullmq-connection";
import { GmailClientService, GMAIL_COST, NeedsReauthError } from "../gmail-client.service";
import { SenderAggregateService } from "../sender-aggregate.service";
import { MessageUpsertService } from "../message-upsert.service";
import { callGmailWithRetry } from "../gmail-retry";
import { mapWithConcurrency } from "../concurrency";
import { reconcileStalledSyncJob } from "../reconcile-stalled-job";
import { QUEUE_FULL_SYNC, type FullSyncJobData } from "../queues";

const PAGE_SIZE = 100;
const GET_CONCURRENCY = 8;

@Injectable()
export class FullSyncProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FullSyncProcessor.name);
  private worker?: Worker<FullSyncJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailClient: GmailClientService,
    private readonly senderAggregate: SenderAggregateService,
    private readonly messageUpsert: MessageUpsertService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<FullSyncJobData>(
      QUEUE_FULL_SYNC,
      (job) => this.run(job),
      { connection: bullmqConnection(), concurrency: 2 },
    );
    this.worker.on("failed", async (job, err) => {
      this.logger.error(`Full sync job ${job?.id} failed: ${err.message}`);
      if (!job) return;
      if ((await job.getState()) !== "failed") return; // BullMQ is retrying this attempt via backoff
      await reconcileStalledSyncJob(this.prisma, job.data.syncJobId, job.data.mailboxAccountId, err.message);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async run(job: Job<FullSyncJobData>): Promise<void> {
    const { syncJobId, mailboxAccountId } = job.data;
    const syncJob = await this.prisma.syncJob.findUniqueOrThrow({ where: { id: syncJobId } });

    await this.prisma.$transaction([
      this.prisma.syncJob.update({ where: { id: syncJobId }, data: { status: "running", startedAt: new Date() } }),
      this.prisma.mailboxAccount.update({
        where: { id: mailboxAccountId },
        data: { syncStatus: "syncing", syncError: null },
      }),
    ]);

    let messagesSynced = 0;
    try {
      const gmail = await this.gmailClient.forMailbox(mailboxAccountId);
      let pageToken: string | undefined = syncJob.cursor ?? undefined;

      do {
        await this.gmailClient.acquireQuota(mailboxAccountId, GMAIL_COST.LIST);
        const listRes = await callGmailWithRetry(() =>
          gmail.users.messages.list({ userId: "me", maxResults: PAGE_SIZE, pageToken }),
        );
        const ids = (listRes.data.messages ?? []).map((m) => m.id!).filter(Boolean);

        await mapWithConcurrency(ids, GET_CONCURRENCY, async (id) => {
          await this.gmailClient.acquireQuota(mailboxAccountId, GMAIL_COST.GET);
          const msgRes = await callGmailWithRetry(() =>
            gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["From", "Subject"] }),
          );
          await this.messageUpsert.upsertFromMetadata(mailboxAccountId, msgRes.data);
          messagesSynced++;
        });

        pageToken = listRes.data.nextPageToken ?? undefined;
        await this.prisma.syncJob.update({
          where: { id: syncJobId },
          data: { cursor: pageToken ?? null, stats: { messagesSynced } },
        });
      } while (pageToken);

      const profile = await callGmailWithRetry(() => gmail.users.getProfile({ userId: "me" }));
      await this.senderAggregate.recompute(mailboxAccountId);

      await this.prisma.$transaction([
        this.prisma.syncJob.update({
          where: { id: syncJobId },
          data: { status: "completed", finishedAt: new Date(), stats: { messagesSynced } },
        }),
        this.prisma.mailboxAccount.update({
          where: { id: mailboxAccountId },
          data: {
            syncStatus: "idle",
            lastSyncedAt: new Date(),
            historyId: profile.data.historyId ?? undefined,
          },
        }),
      ]);
    } catch (err) {
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
}
