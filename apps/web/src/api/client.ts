import type {
  ApiErrorEnvelope,
  BulkActionDto,
  CategoryInsightsResponse,
  MailboxSummaryDto,
  SenderDetailResponse,
  SenderListResponse,
  SubjectInsightsResponse,
  SyncJobDto,
  UnreadInsightsResponse,
  UnsubscribeCandidatesResponse,
  VolumeInsightsResponse,
} from "@gmail-insights/shared";

// Strip any trailing slash so a misconfigured env var (with or without one)
// can't produce a double-slash when concatenated with a leading-slash path
// below — some frameworks treat "//auth/..." as a distinct, non-matching route.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
    throw new ApiError(body?.code ?? "unknown", body?.message ?? res.statusText, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface MeResponse {
  id: string;
  email: string;
  displayName: string | null;
  mailboxAccounts: { id: string; gmailAddress: string }[];
}

export const api = {
  me: () => request<MeResponse>("/auth/me"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  loginUrl: () => `${API_BASE_URL}/auth/google/login`,
  upgradeScopeUrl: () => `${API_BASE_URL}/auth/google/upgrade-scope`,

  mailboxSummary: (mailboxId: string) => request<MailboxSummaryDto>(`/mailbox/${mailboxId}`),

  triggerFullSync: (mailboxId: string) =>
    request<SyncJobDto>(`/mailbox/${mailboxId}/sync/full`, { method: "POST" }),
  triggerIncrementalSync: (mailboxId: string) =>
    request<SyncJobDto>(`/mailbox/${mailboxId}/sync/incremental`, { method: "POST" }),
  syncStatus: (mailboxId: string) => request<SyncJobDto | null>(`/mailbox/${mailboxId}/sync/status`),

  senders: (mailboxId: string, params: { sort: string; search?: string; page: number; pageSize: number }) => {
    const qs = new URLSearchParams({
      sort: params.sort,
      page: String(params.page),
      pageSize: String(params.pageSize),
      ...(params.search ? { search: params.search } : {}),
    });
    return request<SenderListResponse>(`/mailbox/${mailboxId}/senders?${qs.toString()}`);
  },

  senderDetail: (mailboxId: string, email: string) =>
    request<SenderDetailResponse>(`/mailbox/${mailboxId}/senders/${encodeURIComponent(email)}`),

  insightsVolume: (mailboxId: string, bucket: "day" | "week", days: number) =>
    request<VolumeInsightsResponse>(`/mailbox/${mailboxId}/insights/volume?bucket=${bucket}&days=${days}`),
  insightsCategories: (mailboxId: string) =>
    request<CategoryInsightsResponse>(`/mailbox/${mailboxId}/insights/categories`),
  insightsUnread: (mailboxId: string) => request<UnreadInsightsResponse>(`/mailbox/${mailboxId}/insights/unread`),
  insightsSubjects: (mailboxId: string) => request<SubjectInsightsResponse>(`/mailbox/${mailboxId}/insights/subjects`),
  insightsUnsubscribeCandidates: (mailboxId: string) =>
    request<UnsubscribeCandidatesResponse>(`/mailbox/${mailboxId}/insights/unsubscribe-candidates`),

  previewTrash: (mailboxId: string, senderEmail: string) =>
    request<BulkActionDto>(`/mailbox/${mailboxId}/actions/trash`, {
      method: "POST",
      body: JSON.stringify({ senderEmail }),
    }),
  confirmAction: (mailboxId: string, actionId: string) =>
    request<BulkActionDto>(`/mailbox/${mailboxId}/actions/${actionId}/confirm`, { method: "POST" }),
  cancelAction: (mailboxId: string, actionId: string) =>
    request<BulkActionDto>(`/mailbox/${mailboxId}/actions/${actionId}/cancel`, { method: "POST" }),
  getAction: (mailboxId: string, actionId: string) =>
    request<BulkActionDto>(`/mailbox/${mailboxId}/actions/${actionId}`),
  actionHistory: (mailboxId: string) => request<BulkActionDto[]>(`/mailbox/${mailboxId}/actions`),
};
