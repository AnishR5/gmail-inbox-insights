import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircleIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { BulkActionDto } from "@gmail-insights/shared";
import { ApiError, api } from "../api/client";

const IN_FLIGHT_STATUSES = new Set(["confirmed", "in_progress"]);

export default function BulkActionModal({
  mailboxId,
  action,
  onClose,
}: {
  mailboxId: string;
  action: BulkActionDto;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["bulkAction", mailboxId, action.id],
    queryFn: () => api.getAction(mailboxId, action.id),
    initialData: action,
    refetchInterval: (query) => (query.state.data && IN_FLIGHT_STATUSES.has(query.state.data.status) ? 1500 : false),
  });

  const current = statusQuery.data ?? action;
  const isTerminal = ["completed", "completed_with_errors", "failed", "cancelled"].includes(current.status);

  const refreshDashboard = () => {
    queryClient.invalidateQueries({ queryKey: ["senders", mailboxId] });
    queryClient.invalidateQueries({ queryKey: ["mailboxSummary", mailboxId] });
    queryClient.invalidateQueries({ queryKey: ["actionHistory", mailboxId] });
  };

  const confirmMutation = useMutation({
    mutationFn: () => api.confirmAction(mailboxId, action.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(["bulkAction", mailboxId, action.id], updated);
      refreshDashboard();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelAction(mailboxId, action.id),
    onSuccess: onClose,
  });

  // Same class of bug as the sync banner: the status card here polls and
  // updates itself fine, but nothing else (sender table, message/sender
  // counts, history) refetches on its own once the background trash job
  // actually finishes — refreshDashboard() above only fires the instant you
  // click confirm, before the job has done any work. Watch for the
  // in-flight -> terminal transition and refresh those too.
  const wasInFlight = useRef(false);
  useEffect(() => {
    const isInFlightNow = IN_FLIGHT_STATUSES.has(current.status);
    if (wasInFlight.current && !isInFlightNow) {
      refreshDashboard();
    }
    wasInFlight.current = isInFlightNow;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.status]);

  const canDismiss = current.status === "pending_confirmation" || isTerminal;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && canDismiss) {
        if (current.status === "pending_confirmation") cancelMutation.mutate();
        else onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDismiss, current.status]);

  const needsScopeUpgrade = confirmMutation.error instanceof ApiError && confirmMutation.error.code === "modify_scope_required";

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-900/50 px-4 backdrop-blur-[2px]"
      onClick={() => canDismiss && (current.status === "pending_confirmation" ? cancelMutation.mutate() : onClose())}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-action-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md animate-scale-in rounded-xl border border-border bg-background p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <TrashIcon className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <h2 id="bulk-action-title" className="text-base font-semibold text-foreground dark:text-slate-50">
              Move to Trash
            </h2>
          </div>
          {canDismiss && (
            <button
              onClick={() => (current.status === "pending_confirmation" ? cancelMutation.mutate() : onClose())}
              aria-label="Close"
              className="cursor-pointer rounded-md p-1 text-slate-400 transition-colors duration-150 hover:bg-muted hover:text-foreground dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {current.status === "pending_confirmation" && (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              This will move <strong className="font-semibold text-foreground dark:text-slate-100">{current.targetMessageCount}</strong> message
              {current.targetMessageCount === 1 ? "" : "s"} from{" "}
              <strong className="font-semibold text-foreground dark:text-slate-100">{current.senderEmail}</strong> to Trash. Gmail
              keeps trashed mail for 30 days before permanently deleting it, so this is recoverable.
            </p>

            {needsScopeUpgrade && (
              <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                This is the first bulk action for this account — Google needs one more permission
                (modify) before we can move mail to Trash.{" "}
                <a href={api.upgradeScopeUrl()} className="cursor-pointer font-medium underline underline-offset-2">
                  Grant permission
                </a>{" "}
                and then try again.
              </div>
            )}

            {confirmMutation.isError && !needsScopeUpgrade && (
              <div className="mt-3 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                {confirmMutation.error instanceof ApiError
                  ? confirmMutation.error.message
                  : "Something went wrong confirming this action. Please try again."}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => cancelMutation.mutate()}
                className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm text-slate-700 transition-colors duration-150 hover:bg-muted dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
                className="cursor-pointer rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-colors duration-150 hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirmMutation.isPending ? "Confirming…" : "Confirm — move to Trash"}
              </button>
            </div>
          </>
        )}

        {current.status !== "pending_confirmation" && (
          <>
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              {(current.status === "confirmed" || current.status === "in_progress") && (
                <>Moving {current.targetMessageCount} messages to Trash…</>
              )}
              {current.status === "completed" && (
                <>
                  <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  Done — {current.succeededCount} messages moved to Trash.
                </>
              )}
              {current.status === "completed_with_errors" &&
                `Finished with some errors — ${current.succeededCount} succeeded, ${current.failedCount} failed.`}
              {current.status === "failed" && "This action failed. See sync/action history for details."}
              {current.status === "cancelled" && "Cancelled — no messages were changed."}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                disabled={!isTerminal}
                className="cursor-pointer rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                {isTerminal ? "Close" : "Working…"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
