import { InboxStackIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { api } from "../api/client";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/20">
          <InboxStackIcon className="h-6 w-6" aria-hidden="true" />
        </div>

        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground dark:text-slate-50">
          Gmail Inbox Insights
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-slate-500 dark:text-slate-400">
          See who's filling your inbox, at a glance — grouped by sender, with unread counts and safe
          bulk cleanup.
        </p>

        <a
          href={api.loginUrl()}
          className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Connect Gmail
        </a>

        <p className="mt-4 flex items-start gap-1.5 text-left text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          We only request read access to scan your mail. We'll ask separately, only when you choose to
          move messages to trash.
        </p>
      </div>
    </div>
  );
}
