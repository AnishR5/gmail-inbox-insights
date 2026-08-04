import { useQuery } from "@tanstack/react-query";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { api } from "../../api/client";

export default function UnreadInsightsCard({ mailboxId }: { mailboxId: string }) {
  const unreadQuery = useQuery({
    queryKey: ["insightsUnread", mailboxId],
    queryFn: () => api.insightsUnread(mailboxId),
  });

  const data = unreadQuery.data;

  return (
    <div className="rounded-lg border border-border bg-background p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-foreground dark:text-slate-50">Unread</h3>

      {unreadQuery.isLoading || !data ? (
        <div className="mt-3 h-24 animate-pulse rounded bg-muted dark:bg-slate-800" />
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-2xl font-semibold text-foreground dark:text-slate-50">{data.unreadPercent}%</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">of inbox unread</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-foreground dark:text-slate-50">{data.unreadCount}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">unread messages</div>
            </div>
          </div>

          {data.oldestUnread && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-muted/60 p-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <EnvelopeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span>
                Oldest unread:{" "}
                <strong className="font-medium text-foreground dark:text-slate-100">
                  {data.oldestUnread.subject ?? "(no subject)"}
                </strong>{" "}
                from {data.oldestUnread.senderName ?? data.oldestUnread.senderEmail} —{" "}
                {new Date(data.oldestUnread.internalDate).toLocaleDateString()}
              </span>
            </div>
          )}

          {data.topUnreadSenders.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Top unread senders
              </div>
              {data.topUnreadSenders.map((sender) => (
                <div key={sender.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {sender.displayName ?? sender.emailAddress}
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary dark:bg-primary/20">
                    {sender.unreadCount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
