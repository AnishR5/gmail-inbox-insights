import type { ComponentType, SVGProps } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowPathIcon, AtSymbolIcon, ExclamationTriangleIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import type { MeResponse } from "../api/client";
import { api } from "../api/client";
import TopNav from "../components/TopNav";
import SyncStatusBanner from "../components/SyncStatusBanner";
import SenderTable from "../components/SenderTable";

export default function DashboardPage({ me }: { me: MeResponse }) {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  if (!mailboxId) return null;

  const summaryQuery = useQuery({
    queryKey: ["mailboxSummary", mailboxId],
    queryFn: () => api.mailboxSummary(mailboxId),
  });

  const mailbox = me.mailboxAccounts.find((m) => m.id === mailboxId);

  return (
    <div className="min-h-screen bg-muted/40 dark:bg-slate-950">
      <TopNav mailboxId={mailboxId} email={mailbox?.gmailAddress ?? me.email} />

      <main className="mx-auto max-w-4xl space-y-4 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={EnvelopeIcon} label="Total messages" value={summaryQuery.data?.totalMessages} loading={summaryQuery.isLoading} />
          <StatCard icon={AtSymbolIcon} label="Distinct senders" value={summaryQuery.data?.totalSenders} loading={summaryQuery.isLoading} />
          <StatCard
            icon={ArrowPathIcon}
            label="Status"
            value={summaryQuery.data?.syncStatus === "needs_reauth" ? "Needs reconnect" : summaryQuery.data?.syncStatus}
            loading={summaryQuery.isLoading}
          />
        </div>

        {summaryQuery.data?.syncStatus === "needs_reauth" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Google access expired or was revoked.{" "}
              <a href={api.loginUrl()} className="cursor-pointer font-medium underline underline-offset-2">
                Reconnect your account
              </a>
              .
            </span>
          </div>
        )}

        <SyncStatusBanner mailboxId={mailboxId} />
        <SenderTable mailboxId={mailboxId} />
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string | number | undefined;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded bg-muted dark:bg-slate-800" />
      ) : (
        <div className="mt-1 text-2xl font-semibold capitalize text-foreground dark:text-slate-50">{value ?? "—"}</div>
      )}
    </div>
  );
}
