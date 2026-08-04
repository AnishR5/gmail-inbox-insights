import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { api } from "./api/client";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import InsightsPage from "./pages/InsightsPage";
import ActionHistoryPage from "./pages/ActionHistoryPage";

export default function App() {
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false });

  if (meQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 bg-muted/40 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  if (meQuery.isError || !meQuery.data) {
    return <LoginPage />;
  }

  const mailboxId = meQuery.data.mailboxAccounts[0]?.id;
  if (!mailboxId) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted/40 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        No Gmail account connected yet.
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/dashboard/${mailboxId}`} replace />} />
      <Route path="/dashboard/:mailboxId" element={<DashboardPage me={meQuery.data} />} />
      <Route path="/dashboard/:mailboxId/insights" element={<InsightsPage me={meQuery.data} />} />
      <Route path="/dashboard/:mailboxId/history" element={<ActionHistoryPage me={meQuery.data} />} />
      <Route path="*" element={<Navigate to={`/dashboard/${mailboxId}`} replace />} />
    </Routes>
  );
}
