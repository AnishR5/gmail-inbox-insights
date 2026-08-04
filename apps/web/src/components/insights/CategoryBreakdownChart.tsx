import { useQuery } from "@tanstack/react-query";
import type { GmailCategory } from "@gmail-insights/shared";
import { api } from "../../api/client";

// String literals instead of the GmailCategory const object: this is the
// first place the web app would import a runtime value (not just a type)
// from @gmail-insights/shared, and its CJS build doesn't interop cleanly
// with Rollup's named-export detection for that case.
const CATEGORY_LABELS: Record<GmailCategory, string> = {
  CATEGORY_PERSONAL: "Personal",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
};

// Fixed categorical order/assignment — mirrors the GmailCategory declaration
// order the backend already sorts to, so a slot is never reassigned when a
// category has zero messages this sync.
const CATEGORY_COLOR_VARS: Record<GmailCategory, string> = {
  CATEGORY_PERSONAL: "var(--viz-series-1)",
  CATEGORY_SOCIAL: "var(--viz-series-2)",
  CATEGORY_PROMOTIONS: "var(--viz-series-3)",
  CATEGORY_UPDATES: "var(--viz-series-4)",
  CATEGORY_FORUMS: "var(--viz-series-5)",
};

export default function CategoryBreakdownChart({ mailboxId }: { mailboxId: string }) {
  const categoriesQuery = useQuery({
    queryKey: ["insightsCategories", mailboxId],
    queryFn: () => api.insightsCategories(mailboxId),
  });

  const data = categoriesQuery.data;
  const rows = data
    ? [
        ...data.items.map((item) => ({
          label: CATEGORY_LABELS[item.category],
          count: item.count,
          color: CATEGORY_COLOR_VARS[item.category],
        })),
        ...(data.uncategorized > 0
          ? [{ label: "Uncategorized", count: data.uncategorized, color: "var(--viz-ink-muted)" }]
          : []),
      ]
    : [];
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="viz-root rounded-lg border border-border bg-background p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-foreground dark:text-slate-50">Category breakdown</h3>

      <div className="mt-3 space-y-2.5">
        {categoriesQuery.isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-muted dark:bg-slate-800" />
          ))}
        {!categoriesQuery.isLoading && rows.length === 0 && (
          <div className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            No categorized mail yet — run a sync to scan your mailbox.
          </div>
        )}
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 text-sm">
            <div className="w-24 shrink-0 text-slate-600 dark:text-slate-300">{row.label}</div>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted dark:bg-slate-800">
              <div
                className="h-full rounded-full"
                style={{ width: `${(row.count / maxCount) * 100}%`, backgroundColor: row.color }}
              />
            </div>
            <div className="w-10 shrink-0 text-right tabular-nums text-slate-500 dark:text-slate-400">
              {row.count}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
