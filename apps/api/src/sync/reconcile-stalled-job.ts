import { Logger } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";

const logger = new Logger("SyncJobReconciler");

/**
 * BullMQ's own Worker 'failed' event fires on every failed attempt,
 * including ones it's about to retry via backoff — reconciling Postgres on
 * those would wrongly show "failed" for a job that's still going to succeed.
 * It also fires for terminal failures our processor's own try/catch never
 * got to run for, e.g. `UnrecoverableError: job stalled more than allowable
 * limit` when the worker process itself died mid-job (deploy, crash, laptop
 * sleep) — those leave the SyncJob/MailboxAccount rows stuck at
 * running/syncing forever with nothing left to ever update them, since no
 * code re-enters run() for a job BullMQ has already given up on.
 *
 * Call this from the 'failed' handler after confirming via job.getState()
 * that the job is actually terminal, to reconcile Postgres for exactly that
 * case without misfiring on ordinary retries.
 */
export async function reconcileStalledSyncJob(
  prisma: PrismaService,
  syncJobId: string,
  mailboxAccountId: string,
  errorMessage: string,
): Promise<void> {
  const syncJob = await prisma.syncJob.findUnique({ where: { id: syncJobId } });
  if (!syncJob || syncJob.status === "completed" || syncJob.status === "failed") {
    return; // already reconciled by the processor's own catch block
  }

  logger.warn(`Reconciling orphaned sync job ${syncJobId} (mailbox ${mailboxAccountId}): ${errorMessage}`);

  await prisma.$transaction([
    prisma.syncJob.update({
      where: { id: syncJobId },
      data: { status: "failed", finishedAt: new Date(), error: errorMessage },
    }),
    prisma.mailboxAccount.update({
      where: { id: mailboxAccountId },
      data: { syncStatus: "error", syncError: errorMessage },
    }),
  ]);
}
