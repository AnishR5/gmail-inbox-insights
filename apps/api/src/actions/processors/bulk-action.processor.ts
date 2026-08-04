import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { bullmqConnection } from "../../sync/bullmq-connection";
import { GmailClientService, GMAIL_COST, NeedsReauthError } from "../../sync/gmail-client.service";
import { SenderAggregateService } from "../../sync/sender-aggregate.service";
import { callGmailWithRetry } from "../../sync/gmail-retry";
import { QUEUE_BULK_ACTION, type BulkActionJobData } from "../../sync/queues";

const CHUNK_SIZE = 500; // Gmail batchModify accepts up to 1000 ids per call; stay conservative.

@Injectable()
export class BulkActionProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkActionProcessor.name);
  private worker?: Worker<BulkActionJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailClient: GmailClientService,
    private readonly senderAggregate: SenderAggregateService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<BulkActionJobData>(
      QUEUE_BULK_ACTION,
      (job) => this.run(job),
      { connection: bullmqConnection(), concurrency: 2 },
    );
    this.worker.on("failed", async (job, err) => {
      this.logger.error(`Bulk action job ${job?.id} failed: ${err.message}`);
      if (!job) return;
      if ((await job.getState()) !== "failed") return; // BullMQ is retrying this attempt via backoff
      await this.reconcileStalledAction(job.data.bulkActionId, err.message);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async run(job: Job<BulkActionJobData>): Promise<void> {
    const { bulkActionId, mailboxAccountId } = job.data;
    const action = await this.prisma.bulkAction.findUniqueOrThrow({
      where: { id: bulkActionId },
      include: { messages: { where: { status: "pending" } } },
    });

    if (action.status !== "confirmed") {
      // Already terminal (e.g. cancelled) or already processed by a previous attempt.
      return;
    }

    await this.prisma.bulkAction.update({ where: { id: bulkActionId }, data: { status: "in_progress" } });

    const pendingIds = action.messages.map((m) => m.messageId);
    const chunks = chunk(pendingIds, CHUNK_SIZE);
    let aborted = false;

    try {
      const gmail = await this.gmailClient.forMailbox(mailboxAccountId);

      for (const ids of chunks) {
        try {
          await this.gmailClient.acquireQuota(mailboxAccountId, GMAIL_COST.BATCH_MODIFY);
          await callGmailWithRetry(() =>
            gmail.users.messages.batchModify({ userId: "me", requestBody: { ids, addLabelIds: ["TRASH"] } }),
          );

          await this.prisma.bulkActionMessage.updateMany({
            where: { bulkActionId, messageId: { in: ids } },
            data: { status: "succeeded" },
          });
          await this.prisma.$executeRaw`
            UPDATE messages SET label_ids = array_append(label_ids, 'TRASH')
            WHERE id = ANY(${ids}) AND NOT ('TRASH' = ANY(label_ids))
          `;
        } catch (err) {
          if (err instanceof NeedsReauthError) {
            await this.prisma.bulkActionMessage.updateMany({
              where: { bulkActionId, messageId: { in: pendingIds } },
              data: { status: "failed", error: "Gmail authorization was revoked mid-run" },
            });
            aborted = true;
            break;
          }
          const message = (err as Error).message;
          await this.prisma.bulkActionMessage.updateMany({
            where: { bulkActionId, messageId: { in: ids } },
            data: { status: "failed", error: message },
          });
        }
      }
    } finally {
      await this.senderAggregate.recompute(mailboxAccountId);
    }

    const failedCount = await this.prisma.bulkActionMessage.count({ where: { bulkActionId, status: "failed" } });
    await this.prisma.bulkAction.update({
      where: { id: bulkActionId },
      data: {
        status: aborted ? "failed" : failedCount > 0 ? "completed_with_errors" : "completed",
        completedAt: new Date(),
      },
    });
  }

  /**
   * Same reasoning as reconcileStalledSyncJob: if the worker process itself
   * died mid-run (crash, deploy, laptop sleep), BullMQ eventually marks the
   * job terminally failed (e.g. "stalled more than allowable limit") without
   * ever re-entering run() — leaving bulk_actions stuck at in_progress
   * forever with nothing left to reconcile it. Only called once
   * job.getState() confirms this is terminal, not an ordinary retry.
   */
  private async reconcileStalledAction(bulkActionId: string, errorMessage: string): Promise<void> {
    const action = await this.prisma.bulkAction.findUnique({ where: { id: bulkActionId } });
    if (!action || !["confirmed", "in_progress"].includes(action.status)) {
      return; // already terminal, or never got past confirmation
    }

    this.logger.warn(`Reconciling orphaned bulk action ${bulkActionId}: ${errorMessage}`);
    await this.prisma.$transaction([
      this.prisma.bulkActionMessage.updateMany({
        where: { bulkActionId, status: "pending" },
        data: { status: "failed", error: errorMessage },
      }),
      this.prisma.bulkAction.update({
        where: { id: bulkActionId },
        data: { status: "failed", completedAt: new Date() },
      }),
    ]);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
