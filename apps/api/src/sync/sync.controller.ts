import { Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { Queue } from "bullmq";
import type { SyncJobDto } from "@gmail-insights/shared";
import { SessionGuard } from "../auth/session.guard";
import { MailboxOwnerGuard } from "../mailbox/mailbox-owner.guard";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_JOB_OPTS, QUEUE_FULL_SYNC, QUEUE_INCREMENTAL_SYNC, type FullSyncJobData, type IncrementalSyncJobData } from "./queues";
import { FULL_SYNC_QUEUE, INCREMENTAL_SYNC_QUEUE } from "./sync-queues.module";

@UseGuards(SessionGuard, MailboxOwnerGuard)
@Controller("mailbox/:id/sync")
export class SyncController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FULL_SYNC_QUEUE) private readonly fullSyncQueue: Queue<FullSyncJobData>,
    @Inject(INCREMENTAL_SYNC_QUEUE) private readonly incrementalSyncQueue: Queue<IncrementalSyncJobData>,
  ) {}

  @Post("full")
  async triggerFullSync(@Param("id") mailboxAccountId: string): Promise<SyncJobDto> {
    const syncJob = await this.prisma.syncJob.create({ data: { mailboxAccountId, type: "full" } });
    await this.fullSyncQueue.add(QUEUE_FULL_SYNC, { syncJobId: syncJob.id, mailboxAccountId }, DEFAULT_JOB_OPTS);
    return toDto(syncJob);
  }

  @Post("incremental")
  async triggerIncrementalSync(@Param("id") mailboxAccountId: string): Promise<SyncJobDto> {
    const syncJob = await this.prisma.syncJob.create({ data: { mailboxAccountId, type: "incremental" } });
    await this.incrementalSyncQueue.add(
      QUEUE_INCREMENTAL_SYNC,
      { syncJobId: syncJob.id, mailboxAccountId },
      DEFAULT_JOB_OPTS,
    );
    return toDto(syncJob);
  }

  @Get("status")
  async status(@Param("id") mailboxAccountId: string): Promise<SyncJobDto | null> {
    const syncJob = await this.prisma.syncJob.findFirst({
      where: { mailboxAccountId },
      orderBy: { createdAt: "desc" },
    });
    return syncJob ? toDto(syncJob) : null;
  }
}

function toDto(syncJob: {
  id: string;
  type: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  stats: unknown;
}): SyncJobDto {
  return {
    id: syncJob.id,
    type: syncJob.type as SyncJobDto["type"],
    status: syncJob.status as SyncJobDto["status"],
    startedAt: syncJob.startedAt?.toISOString() ?? null,
    finishedAt: syncJob.finishedAt?.toISOString() ?? null,
    error: syncJob.error,
    stats: (syncJob.stats as Record<string, unknown>) ?? null,
  };
}
