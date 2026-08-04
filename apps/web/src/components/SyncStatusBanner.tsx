import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { api } from "../api/client";

const ACTIVE_STATUSES = new Set(["queued", "running"]);

export default function SyncStatusBanner({ mailboxId }: { mailboxId: string }) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["syncStatus", mailboxId],
    queryFn: () => api.syncStatus(mailboxId),
    refetchInterval: (query) => (query.state.data && ACTIVE_STATUSES.has(query.state.data.status) ? 2000 : false),
  });

  const invalidateAfterSync = () => {
    queryClient.invalidateQueries({ queryKey: ["syncStatus", mailboxId] });
    queryClient.invalidateQueries({ queryKey: ["senders", mailboxId] });
    queryClient.invalidateQueries({ queryKey: ["mailboxSummary", mailboxId] });
  };

  // The status card above polls and updates itself fine, but nothing else
  // (sender table, message/sender counts) refetches on its own once a
  // background sync job — kicked off from here or from a previous session —
  // finishes. Watch for an active -> terminal transition and refresh those too.
  const wasActive = useRef(false);
  useEffect(() => {
    const status = statusQuery.data?.status;
    if (!status) return;
    const isActiveNow = ACTIVE_STATUSES.has(status);
    if (wasActive.current && !isActiveNow) {
      queryClient.invalidateQueries({ queryKey: ["senders", mailboxId] });
      queryClient.invalidateQueries({ queryKey: ["mailboxSummary", mailboxId] });
    }
    wasActive.current = isActiveNow;
  }, [statusQuery.data?.status, mailboxId, queryClient]);

  const fullSync = useMutation({
    mutationFn: () => api.triggerFullSync(mailboxId),
    onSuccess: invalidateAfterSync,
  });
  const incrementalSync = useMutation({
    mutationFn: () => api.triggerIncrementalSync(mailboxId),
    onSuccess: invalidateAfterSync,
  });

  const job = statusQuery.data;
  const isActive = job ? ACTIVE_STATUSES.has(job.status) : false;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        {isActive && <ArrowPathIcon className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />}
        {!isActive && job?.status === "completed" && (
          <CheckCircleIcon className="h-4 w-4 text-emerald-500" aria-hidden="true" />
        )}
        {job?.status === "failed" && <ExclamationCircleIcon className="h-4 w-4 text-destructive" aria-hidden="true" />}
        <span className="text-slate-600 dark:text-slate-300">
          {!job && "No sync has run yet."}
          {job?.status === "queued" && "Sync queued…"}
          {job?.status === "running" && `Syncing… (${(job.stats as { messagesSynced?: number })?.messagesSynced ?? 0} messages so far)`}
          {job?.status === "completed" && "Up to date."}
          {job?.status === "failed" && <span className="text-destructive">Last sync failed: {job.error}</span>}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          disabled={isActive || incrementalSync.isPending}
          onClick={() => incrementalSync.mutate()}
          className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Quick sync
        </button>
        <button
          disabled={isActive || fullSync.isPending}
          onClick={() => fullSync.mutate()}
          className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Full sync
        </button>
      </div>
    </div>
  );
}
