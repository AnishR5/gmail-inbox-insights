import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { bullmqConnection } from "../bullmq-connection";
import {
  DEFAULT_JOB_OPTS,
  QUEUE_INCREMENTAL_SYNC,
  QUEUE_SYNC_SCHEDULER,
  type IncrementalSyncJobData,
  type SyncSchedulerTickData,
} from "../queues";
import { INCREMENTAL_SYNC_QUEUE, SYNC_SCHEDULER_QUEUE } from "../sync-queues.module";

// Widened from 30 minutes: on Azure App Service Free F1 (60 CPU-min/day
// quota, no Always On), this app's background workers are themselves a
// meaningful source of ongoing CPU load — 48 sync cycles/day at 30min adds
// up fast even with zero visitors. Users can always trigger "Quick sync"
// manually from the dashboard for on-demand freshness.
const SCHEDULER_INTERVAL_MS = 3 * 60 * 60 * 1000;
const SCHEDULER_TICK_JOB_ID = "sync-scheduler-tick";
const IN_FLIGHT_SYNC_STATUSES = ["queued", "running"] as const;

/**
 * Ticks every SCHEDULER_INTERVAL_MS via a BullMQ repeatable job (fixed jobId,
 * so re-registering on every boot is idempotent) and enqueues an incremental
 * sync for each mailbox that isn't already mid-sync — same "create SyncJob,
 * enqueue" sequence SyncController.triggerIncrementalSync does for manual
 * syncs, just fanned out across all mailboxes on a timer.
 */
@Injectable()
export class SyncSchedulerProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncSchedulerProcessor.name);
  private worker?: Worker<SyncSchedulerTickData>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SYNC_SCHEDULER_QUEUE) private readonly schedulerQueue: Queue<SyncSchedulerTickData>,
    @Inject(INCREMENTAL_SYNC_QUEUE) private readonly incrementalSyncQueue: Queue<IncrementalSyncJobData>,
  ) {}

  async onModuleInit() {
    this.worker = new Worker<SyncSchedulerTickData>(QUEUE_SYNC_SCHEDULER, () => this.run(), {
      connection: bullmqConnection(),
      concurrency: 1,
    });
    this.worker.on("failed", (job, err) =>
      this.logger.error(`Sync scheduler tick ${job?.id} failed: ${err.message}`),
    );

    await this.schedulerQueue.add(
      QUEUE_SYNC_SCHEDULER,
      {},
      { repeat: { every: SCHEDULER_INTERVAL_MS }, jobId: SCHEDULER_TICK_JOB_ID },
    );
    this.logger.log(`Registered recurring sync every ${SCHEDULER_INTERVAL_MS / 60_000} minutes`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async run(): Promise<void> {
    const mailboxes = await this.prisma.mailboxAccount.findMany({
      where: { syncStatus: { not: "needs_reauth" } },
    });

    for (const mailbox of mailboxes) {
      if (mailbox.syncStatus === "syncing") continue;

      const inFlightJob = await this.prisma.syncJob.findFirst({
        where: { mailboxAccountId: mailbox.id, status: { in: [...IN_FLIGHT_SYNC_STATUSES] } },
      });
      if (inFlightJob) continue;

      const syncJob = await this.prisma.syncJob.create({
        data: { mailboxAccountId: mailbox.id, type: "incremental" },
      });
      await this.incrementalSyncQueue.add(
        QUEUE_INCREMENTAL_SYNC,
        { syncJobId: syncJob.id, mailboxAccountId: mailbox.id },
        DEFAULT_JOB_OPTS,
      );
    }
  }
}
