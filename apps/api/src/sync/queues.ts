export const QUEUE_FULL_SYNC = "gmail-full-sync";
export const QUEUE_INCREMENTAL_SYNC = "gmail-incremental-sync";
export const QUEUE_BULK_ACTION = "gmail-bulk-action";
export const QUEUE_SYNC_SCHEDULER = "gmail-sync-scheduler";

export interface FullSyncJobData {
  syncJobId: string;
  mailboxAccountId: string;
}

export interface IncrementalSyncJobData {
  syncJobId: string;
  mailboxAccountId: string;
}

export interface BulkActionJobData {
  bulkActionId: string;
  mailboxAccountId: string;
}

export type SyncSchedulerTickData = Record<string, never>;

export const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 500 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};
