import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TrashIcon } from "@heroicons/react/24/outline";
import type { BulkActionDto } from "@gmail-insights/shared";
import { api } from "../../api/client";
import BulkActionModal from "../BulkActionModal";

export default function UnsubscribeCandidatesList({ mailboxId }: { mailboxId: string }) {
  const [activeAction, setActiveAction] = useState<BulkActionDto | null>(null);

  const candidatesQuery = useQuery({
    queryKey: ["insightsUnsubscribeCandidates", mailboxId],
    queryFn: () => api.insightsUnsubscribeCandidates(mailboxId),
  });

  const previewTrash = useMutation({
    mutationFn: (senderEmail: string) => api.previewTrash(mailboxId, senderEmail),
    onSuccess: (action) => setActiveAction(action),
  });

  const items = candidatesQuery.data?.items ?? [];

  return (
    <div className="rounded-lg border border-border bg-background p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-foreground dark:text-slate-50">Unsubscribe candidates</h3>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        High-volume senders you rarely read — 5+ messages, mostly unread.
      </p>

      <div className="mt-3 space-y-1">
        {candidatesQuery.isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-muted dark:bg-slate-800" />
          ))}
        {!candidatesQuery.isLoading && items.length === 0 && (
          <div className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
            No unsubscribe candidates found.
          </div>
        )}
        {items.map((candidate) => (
          <div
            key={candidate.emailAddress}
            className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5 transition-colors duration-150 hover:bg-muted/60 dark:hover:bg-slate-800/60"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground dark:text-slate-100">
                {candidate.displayName ?? candidate.emailAddress}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500">
                {candidate.messageCount} messages · {Math.round(candidate.unreadRate * 100)}% unread
              </div>
            </div>
            <button
              disabled={previewTrash.isPending}
              onClick={() => previewTrash.mutate(candidate.emailAddress)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors duration-150 hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Move to Trash
            </button>
          </div>
        ))}
      </div>

      {activeAction && (
        <BulkActionModal mailboxId={mailboxId} action={activeAction} onClose={() => setActiveAction(null)} />
      )}
    </div>
  );
}
