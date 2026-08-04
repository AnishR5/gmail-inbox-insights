import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClockIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { MeResponse } from "../api/client";
import { api } from "../api/client";
import TopNav from "../components/TopNav";

const STATUS_STYLES: Record<string, string> = {
  pending_confirmation: "bg-muted text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  confirmed: "bg-primary/10 text-primary dark:bg-primary/20",
  in_progress: "bg-primary/10 text-primary dark:bg-primary/20",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  completed_with_errors: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export default function ActionHistoryPage({ me }: { me: MeResponse }) {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  if (!mailboxId) return null;

  const historyQuery = useQuery({
    queryKey: ["actionHistory", mailboxId],
    queryFn: () => api.actionHistory(mailboxId),
  });

  const mailbox = me.mailboxAccounts.find((m) => m.id === mailboxId);

  return (
    <div className="min-h-screen bg-muted/40 dark:bg-slate-950">
      <TopNav mailboxId={mailboxId} email={mailbox?.gmailAddress ?? me.email} />

      <main className="mx-auto max-w-4xl px-6 py-6">
        <h1 className="mb-4 text-lg font-semibold text-foreground dark:text-slate-50">Action history</h1>

        <div className="overflow-hidden rounded-lg border border-border bg-background dark:border-slate-800 dark:bg-slate-900">
          {historyQuery.isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border-b border-border px-4 py-3 last:border-0 dark:border-slate-800">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted dark:bg-slate-800" />
              </div>
            ))}

          {historyQuery.data?.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              <ClockIcon className="h-8 w-8" aria-hidden="true" />
              No bulk actions yet.
            </div>
          )}

          {historyQuery.data?.map((action) => (
            <div
              key={action.id}
              className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-0 dark:border-slate-800"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <div className="font-medium text-foreground dark:text-slate-100">
                    {action.senderEmail} · {action.targetMessageCount} messages
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    {new Date(action.requestedAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[action.status] ?? ""}`}
              >
                {action.status.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
