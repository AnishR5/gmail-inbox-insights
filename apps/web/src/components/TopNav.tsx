import { ArrowRightStartOnRectangleIcon, EnvelopeOpenIcon } from "@heroicons/react/24/outline";
import { Link, useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", suffix: "" },
  { key: "insights", label: "Insights", suffix: "/insights" },
  { key: "history", label: "Action history", suffix: "/history" },
] as const;

export default function TopNav({ mailboxId, email }: { mailboxId: string; email: string }) {
  const location = useLocation();

  const logout = useMutation({
    mutationFn: api.logout,
    // A client-side navigate("/") here would race the query cache: the
    // dashboard route recomputes its redirect target from the (still
    // briefly cached) mailbox id and can bounce straight back to
    // /dashboard/:id before the "me" query re-fetches and errors out —
    // landing back on a dashboard that just 401s on everything. A full
    // reload sidesteps that entirely: fresh app state, no stale cache,
    // no leftover polling intervals hitting the now-dead session.
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  const activeKey = location.pathname.endsWith("/history")
    ? "history"
    : location.pathname.endsWith("/insights")
      ? "insights"
      : "dashboard";

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-6">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground dark:text-slate-50">
          <EnvelopeOpenIcon className="h-5 w-5 text-primary" aria-hidden="true" />
          Gmail Inbox Insights
        </span>
        <nav className="flex gap-1 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              to={`/dashboard/${mailboxId}${item.suffix}`}
              aria-current={activeKey === item.key ? "page" : undefined}
              className={`cursor-pointer rounded-md px-2.5 py-1.5 transition-colors duration-150 ${
                activeKey === item.key
                  ? "font-medium text-primary"
                  : "text-slate-500 hover:text-foreground dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
        <span>{email}</span>
        <button
          onClick={() => logout.mutate()}
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-slate-400 transition-colors duration-150 hover:text-foreground dark:hover:text-slate-100"
        >
          <ArrowRightStartOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
          Log out
        </button>
      </div>
    </header>
  );
}
