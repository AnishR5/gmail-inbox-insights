import { z } from "zod";

export const MailboxSyncStatus = {
  IDLE: "idle",
  SYNCING: "syncing",
  ERROR: "error",
  NEEDS_REAUTH: "needs_reauth",
} as const;
export type MailboxSyncStatus = (typeof MailboxSyncStatus)[keyof typeof MailboxSyncStatus];

export const SyncJobType = { FULL: "full", INCREMENTAL: "incremental" } as const;
export type SyncJobType = (typeof SyncJobType)[keyof typeof SyncJobType];

export const SyncJobStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export type SyncJobStatus = (typeof SyncJobStatus)[keyof typeof SyncJobStatus];

export const BulkActionStatus = {
  PENDING_CONFIRMATION: "pending_confirmation",
  CONFIRMED: "confirmed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  COMPLETED_WITH_ERRORS: "completed_with_errors",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;
export type BulkActionStatus = (typeof BulkActionStatus)[keyof typeof BulkActionStatus];

export interface MailboxSummaryDto {
  id: string;
  gmailAddress: string;
  syncStatus: MailboxSyncStatus;
  lastSyncedAt: string | null;
  totalMessages: number;
  totalSenders: number;
  hasModifyScope: boolean;
}

export interface SenderDto {
  id: string;
  emailAddress: string;
  displayName: string | null;
  messageCount: number;
  unreadCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

export interface SenderListResponse {
  items: SenderDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SyncJobDto {
  id: string;
  type: SyncJobType;
  status: SyncJobStatus;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  stats: Record<string, unknown> | null;
}

export interface BulkActionDto {
  id: string;
  actionType: "trash";
  senderEmail: string;
  targetMessageCount: number;
  status: BulkActionStatus;
  requestedAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  succeededCount: number;
  failedCount: number;
}

export const CreateTrashActionSchema = z.object({
  senderEmail: z.string().email(),
});
export type CreateTrashActionInput = z.infer<typeof CreateTrashActionSchema>;

export const SenderListQuerySchema = z.object({
  sort: z.enum(["count", "unread", "recent"]).default("count"),
  search: z.string().trim().max(320).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type SenderListQuery = z.infer<typeof SenderListQuerySchema>;

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  requestId: string;
}

export interface SenderRecentMessageDto {
  id: string;
  subject: string | null;
  internalDate: string;
  isUnread: boolean;
}

export interface SenderDetailResponse extends SenderDto {
  recentMessages: SenderRecentMessageDto[];
}

export interface VolumePointDto {
  date: string;
  count: number;
}

export interface VolumeInsightsResponse {
  bucket: "day" | "week";
  items: VolumePointDto[];
}

export const VolumeQuerySchema = z.object({
  bucket: z.enum(["day", "week"]).default("day"),
  days: z.coerce.number().int().min(1).max(365).default(90),
});
export type VolumeQuery = z.infer<typeof VolumeQuerySchema>;

export const GmailCategory = {
  PERSONAL: "CATEGORY_PERSONAL",
  SOCIAL: "CATEGORY_SOCIAL",
  PROMOTIONS: "CATEGORY_PROMOTIONS",
  UPDATES: "CATEGORY_UPDATES",
  FORUMS: "CATEGORY_FORUMS",
} as const;
export type GmailCategory = (typeof GmailCategory)[keyof typeof GmailCategory];

export interface CategoryBreakdownItemDto {
  category: GmailCategory;
  count: number;
}

export interface CategoryInsightsResponse {
  items: CategoryBreakdownItemDto[];
  uncategorized: number;
  total: number;
}

export interface UnreadOldestMessageDto {
  id: string;
  subject: string | null;
  senderEmail: string;
  senderName: string | null;
  internalDate: string;
}

export interface UnreadInsightsResponse {
  unreadCount: number;
  totalCount: number;
  unreadPercent: number;
  oldestUnread: UnreadOldestMessageDto | null;
  topUnreadSenders: SenderDto[];
}

export interface SubjectKeywordDto {
  word: string;
  count: number;
}

export interface FlaggedSubjectDto {
  id: string;
  subject: string;
  senderEmail: string;
  internalDate: string;
}

export interface SubjectInsightsResponse {
  topKeywords: SubjectKeywordDto[];
  urgentCount: number;
  urgentExamples: FlaggedSubjectDto[];
}

export interface UnsubscribeCandidateDto {
  emailAddress: string;
  displayName: string | null;
  messageCount: number;
  unreadCount: number;
  unreadRate: number;
  lastMessageAt: string | null;
}

export interface UnsubscribeCandidatesResponse {
  items: UnsubscribeCandidateDto[];
}
