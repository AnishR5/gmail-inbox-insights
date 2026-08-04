import { useQuery } from "@tanstack/react-query";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { api } from "../../api/client";

export default function SubjectKeywordsCard({ mailboxId }: { mailboxId: string }) {
  const subjectsQuery = useQuery({
    queryKey: ["insightsSubjects", mailboxId],
    queryFn: () => api.insightsSubjects(mailboxId),
  });

  const data = subjectsQuery.data;
  const maxCount = Math.max(1, ...(data?.topKeywords.map((k) => k.count) ?? []));

  return (
    <div className="viz-root rounded-lg border border-border bg-background p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-foreground dark:text-slate-50">Subject line signal</h3>

      {subjectsQuery.isLoading || !data ? (
        <div className="mt-3 h-32 animate-pulse rounded bg-muted dark:bg-slate-800" />
      ) : (
        <>
          {data.topKeywords.length === 0 ? (
            <div className="mt-3 py-4 text-center text-sm text-slate-400 dark:text-slate-500">
              No subject data yet — run a sync to scan your mailbox.
            </div>
          ) : (
            <div className="mt-3 space-y-1.5">
              {data.topKeywords.map((kw) => (
                <div key={kw.word} className="flex items-center gap-2 text-sm">
                  <div className="w-20 shrink-0 truncate text-slate-600 dark:text-slate-300">{kw.word}</div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted dark:bg-slate-800">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(kw.count / maxCount) * 100}%`, backgroundColor: "var(--viz-series-1)" }}
                    />
                  </div>
                  <div className="w-6 shrink-0 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {kw.count}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.urgentCount > 0 && (
            <div className="mt-4 border-t border-border pt-3 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {data.urgentCount} urgency-flagged subject{data.urgentCount === 1 ? "" : "s"}
              </div>
              <ul className="mt-2 space-y-1">
                {data.urgentExamples.map((ex) => (
                  <li key={ex.id} className="truncate text-xs text-slate-500 dark:text-slate-400">
                    &ldquo;{ex.subject}&rdquo; — {ex.senderEmail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
