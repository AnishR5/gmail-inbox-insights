import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { EnvelopeIcon, EnvelopeOpenIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { api } from "../api/client";

export default function SenderDetailDrawer({
  mailboxId,
  email,
  onClose,
}: {
  mailboxId: string;
  email: string;
  onClose: () => void;
}) {
  const detailQuery = useQuery({
    queryKey: ["senderDetail", mailboxId, email],
    queryFn: () => api.senderDetail(mailboxId, email),
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in justify-end bg-slate-900/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sender-detail-title"
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md animate-scale-in overflow-y-auto border-l border-border bg-background p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="sender-detail-title"
              className="truncate text-base font-semibold text-foreground dark:text-slate-50"
            >
              {detailQuery.data?.displayName ?? email}
            </h2>
            {detailQuery.data?.displayName && (
              <p className="truncate text-xs text-slate-400 dark:text-slate-500">{email}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 cursor-pointer rounded-md p-1 text-slate-400 transition-colors duration-150 hover:bg-muted hover:text-foreground dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {detailQuery.isLoading && (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted dark:bg-slate-800" />
            ))}
          </div>
        )}

        {detailQuery.data && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm dark:border-slate-800">
              <div>
                <div className="text-xs text-slate-400 dark:text-slate-500">Messages</div>
                <div className="font-semibold text-foreground dark:text-slate-50">
                  {detailQuery.data.messageCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 dark:text-slate-500">Unread</div>
                <div className="font-semibold text-foreground dark:text-slate-50">
                  {detailQuery.data.unreadCount}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Recent messages
              </div>
              <ul className="mt-2 space-y-1">
                {detailQuery.data.recentMessages.map((msg) => (
                  <li
                    key={msg.id}
                    className="flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60 dark:hover:bg-slate-800/60"
                  >
                    {msg.isUnread ? (
                      <EnvelopeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    ) : (
                      <EnvelopeOpenIcon
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-foreground dark:text-slate-100">
                        {msg.subject ?? "(no subject)"}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {new Date(msg.internalDate).toLocaleDateString()}
                      </div>
                    </div>
                  </li>
                ))}
                {detailQuery.data.recentMessages.length === 0 && (
                  <li className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
                    No recent messages.
                  </li>
                )}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
