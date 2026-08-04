import { useParams } from "react-router-dom";
import type { MeResponse } from "../api/client";
import TopNav from "../components/TopNav";
import VolumeChart from "../components/insights/VolumeChart";
import CategoryBreakdownChart from "../components/insights/CategoryBreakdownChart";
import UnreadInsightsCard from "../components/insights/UnreadInsightsCard";
import SubjectKeywordsCard from "../components/insights/SubjectKeywordsCard";
import UnsubscribeCandidatesList from "../components/insights/UnsubscribeCandidatesList";

export default function InsightsPage({ me }: { me: MeResponse }) {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  if (!mailboxId) return null;

  const mailbox = me.mailboxAccounts.find((m) => m.id === mailboxId);

  return (
    <div className="min-h-screen bg-muted/40 dark:bg-slate-950">
      <TopNav mailboxId={mailboxId} email={mailbox?.gmailAddress ?? me.email} />

      <main className="mx-auto max-w-6xl space-y-4 px-6 py-6">
        <VolumeChart mailboxId={mailboxId} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CategoryBreakdownChart mailboxId={mailboxId} />
          <UnreadInsightsCard mailboxId={mailboxId} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SubjectKeywordsCard mailboxId={mailboxId} />
          <UnsubscribeCandidatesList mailboxId={mailboxId} />
        </div>
      </main>
    </div>
  );
}
