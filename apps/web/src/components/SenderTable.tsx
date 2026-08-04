import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InboxIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { BulkActionDto } from "@gmail-insights/shared";
import { api } from "../api/client";
import BulkActionModal from "./BulkActionModal";
import SenderDetailDrawer from "./SenderDetailDrawer";

const SORT_OPTIONS = [
  { value: "count", label: "Most messages" },
  { value: "unread", label: "Most unread" },
  { value: "recent", label: "Most recent" },
] as const;

const PAGE_SIZE = 25;

export default function SenderTable({ mailboxId }: { mailboxId: string }) {
  const [sort, setSort] = useState<"count" | "unread" | "recent">("count");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeAction, setActiveAction] = useState<BulkActionDto | null>(null);
  const [detailEmail, setDetailEmail] = useState<string | null>(null);

  const sendersQuery = useQuery({
    queryKey: ["senders", mailboxId, sort, search, page],
    queryFn: () => api.senders(mailboxId, { sort, search: search || undefined, page, pageSize: PAGE_SIZE }),
  });

  const previewTrash = useMutation({
    mutationFn: (senderEmail: string) => api.previewTrash(mailboxId, senderEmail),
    onSuccess: (action) => setActiveAction(action),
  });

  const total = sendersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3 dark:border-slate-800">
        <div className="relative">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search senders…"
            className="w-56 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground transition-colors duration-150 placeholder:text-slate-400 focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as typeof sort);
            setPage(1);
          }}
          className="cursor-pointer rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground transition-colors duration-150 focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
            <th className="px-4 py-2">Sender</th>
            <th className="px-4 py-2">Messages</th>
            <th className="px-4 py-2">Unread</th>
            <th className="px-4 py-2">Last message</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {sendersQuery.isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border last:border-0 dark:border-slate-800">
                <td className="px-4 py-3" colSpan={5}>
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted dark:bg-slate-800" />
                </td>
              </tr>
            ))}
          {sendersQuery.data?.items.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center">
                <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                  <InboxIcon className="h-8 w-8" aria-hidden="true" />
                  <span>No senders yet — run a sync to scan your mailbox.</span>
                </div>
              </td>
            </tr>
          )}
          {sendersQuery.data?.items.map((sender) => (
            <tr
              key={sender.id}
              className="border-b border-border transition-colors duration-150 last:border-0 hover:bg-muted/60 dark:border-slate-800 dark:hover:bg-slate-800/60"
            >
              <td className="px-4 py-2.5">
                <button
                  onClick={() => setDetailEmail(sender.emailAddress)}
                  className="cursor-pointer text-left"
                >
                  <div className="font-medium text-foreground underline-offset-2 hover:underline dark:text-slate-100">
                    {sender.displayName ?? sender.emailAddress}
                  </div>
                  {sender.displayName && (
                    <div className="text-xs text-slate-400 dark:text-slate-500">{sender.emailAddress}</div>
                  )}
                </button>
              </td>
              <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{sender.messageCount}</td>
              <td className="px-4 py-2.5">
                {sender.unreadCount > 0 ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary dark:bg-primary/20">
                    {sender.unreadCount} unread
                  </span>
                ) : (
                  <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                {sender.lastMessageAt ? new Date(sender.lastMessageAt).toLocaleDateString() : "—"}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  disabled={previewTrash.isPending}
                  onClick={() => previewTrash.mutate(sender.emailAddress)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors duration-150 hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                >
                  <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  Move to Trash
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>
            Page {page} of {totalPages} ({total} senders)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
              className="cursor-pointer rounded border border-border p-1 transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
              className="cursor-pointer rounded border border-border p-1 transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {activeAction && (
        <BulkActionModal mailboxId={mailboxId} action={activeAction} onClose={() => setActiveAction(null)} />
      )}
      {detailEmail && (
        <SenderDetailDrawer mailboxId={mailboxId} email={detailEmail} onClose={() => setDetailEmail(null)} />
      )}
    </div>
  );
}
