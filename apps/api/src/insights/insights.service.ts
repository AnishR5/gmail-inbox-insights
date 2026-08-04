import { Injectable } from "@nestjs/common";
import type {
  CategoryInsightsResponse,
  FlaggedSubjectDto,
  GmailCategory,
  SubjectInsightsResponse,
  UnreadInsightsResponse,
  UnsubscribeCandidatesResponse,
  VolumeInsightsResponse,
} from "@gmail-insights/shared";
import { GmailCategory as GmailCategoryValues } from "@gmail-insights/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toSenderDto } from "../senders/senders.service";

const CATEGORY_ORDER = Object.values(GmailCategoryValues) as GmailCategory[];
const TRASH_FILTER = { labelIds: { has: "TRASH" } };

// Bounded to keep this a single in-memory pass over recent metadata rather
// than a full-mailbox scan — plenty for a personal mailbox's "signal" (see
// SenderAggregateService for the same tradeoff on the aggregate rebuild).
const SUBJECT_SAMPLE_SIZE = 5000;
const TOP_KEYWORD_COUNT = 15;
const MAX_URGENT_EXAMPLES = 5;
const MIN_TOKEN_LENGTH = 3;
const STOPWORDS = new Set([
  "the", "a", "an", "for", "your", "you", "is", "are", "to", "and", "on", "in", "of", "re", "fwd", "fw",
  "this", "that", "with", "from", "was", "it", "at", "by", "be", "or", "as", "we", "us", "our", "not",
  "new", "now", "get", "have", "has", "will", "can", "just", "out", "up", "all", "one", "how", "what",
  "were", "been", "its", "into", "than", "then", "over", "off", "per", "via",
]);
const URGENCY_PATTERN =
  /\b(urgent|action required|expir(?:e|es|ing)|final notice|immediately|last chance|limited time)\b/i;

const MIN_UNSUBSCRIBE_MESSAGE_COUNT = 5;
const MIN_UNSUBSCRIBE_UNREAD_RATE = 0.6;
const MAX_UNSUBSCRIBE_CANDIDATES = 20;

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async volume(mailboxAccountId: string, bucket: "day" | "week", days: number): Promise<VolumeInsightsResponse> {
    const step = bucket === "week" ? "1 week" : "1 day";
    const rows = await this.prisma.$queryRaw<{ bucket_start: Date; count: number }[]>`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${bucket}, now() - (${days}::text || ' days')::interval),
          date_trunc(${bucket}, now()),
          ${step}::interval
        ) AS bucket_start
      ),
      counts AS (
        SELECT date_trunc(${bucket}, internal_date) AS bucket_start, count(*)::int AS count
        FROM messages
        WHERE mailbox_account_id = ${mailboxAccountId}
          AND internal_date >= now() - (${days}::text || ' days')::interval
          AND NOT ('TRASH' = ANY(label_ids))
        GROUP BY 1
      )
      SELECT b.bucket_start, COALESCE(c.count, 0)::int AS count
      FROM buckets b LEFT JOIN counts c USING (bucket_start)
      ORDER BY b.bucket_start ASC
    `;

    return {
      bucket,
      items: rows.map((r) => ({ date: r.bucket_start.toISOString(), count: Number(r.count) })),
    };
  }

  async categories(mailboxAccountId: string): Promise<CategoryInsightsResponse> {
    const rows = await this.prisma.$queryRaw<{ label: string; count: number }[]>`
      SELECT label, count(*)::int AS count
      FROM messages m, unnest(m.label_ids) AS label
      WHERE m.mailbox_account_id = ${mailboxAccountId}
        AND NOT ('TRASH' = ANY(m.label_ids))
        AND label LIKE 'CATEGORY_%'
      GROUP BY label
    `;
    const [uncategorizedRow] = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM messages m
      WHERE m.mailbox_account_id = ${mailboxAccountId}
        AND NOT ('TRASH' = ANY(m.label_ids))
        AND NOT (m.label_ids && ARRAY['CATEGORY_PERSONAL','CATEGORY_SOCIAL','CATEGORY_PROMOTIONS','CATEGORY_UPDATES','CATEGORY_FORUMS'])
    `;

    const items = rows
      .filter((r) => CATEGORY_ORDER.includes(r.label as GmailCategory))
      .map((r) => ({ category: r.label as GmailCategory, count: Number(r.count) }))
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));

    const uncategorized = Number(uncategorizedRow?.count ?? 0);
    const total = items.reduce((sum, item) => sum + item.count, 0) + uncategorized;

    return { items, uncategorized, total };
  }

  async unread(mailboxAccountId: string): Promise<UnreadInsightsResponse> {
    const [unreadCount, totalCount, oldestUnread, topUnreadSenders] = await Promise.all([
      this.prisma.message.count({ where: { mailboxAccountId, isUnread: true, NOT: TRASH_FILTER } }),
      this.prisma.message.count({ where: { mailboxAccountId, NOT: TRASH_FILTER } }),
      this.prisma.message.findFirst({
        where: { mailboxAccountId, isUnread: true, NOT: TRASH_FILTER },
        orderBy: { internalDate: "asc" },
        select: { id: true, subject: true, senderEmail: true, senderName: true, internalDate: true },
      }),
      this.prisma.sender.findMany({
        where: { mailboxAccountId, unreadCount: { gt: 0 } },
        orderBy: { unreadCount: "desc" },
        take: 5,
      }),
    ]);

    return {
      unreadCount,
      totalCount,
      unreadPercent: totalCount > 0 ? Math.round((unreadCount / totalCount) * 1000) / 10 : 0,
      oldestUnread: oldestUnread
        ? {
            id: oldestUnread.id,
            subject: oldestUnread.subject,
            senderEmail: oldestUnread.senderEmail,
            senderName: oldestUnread.senderName,
            internalDate: oldestUnread.internalDate.toISOString(),
          }
        : null,
      topUnreadSenders: topUnreadSenders.map(toSenderDto),
    };
  }

  async subjects(mailboxAccountId: string): Promise<SubjectInsightsResponse> {
    const messages = await this.prisma.message.findMany({
      where: { mailboxAccountId, NOT: TRASH_FILTER },
      orderBy: { internalDate: "desc" },
      take: SUBJECT_SAMPLE_SIZE,
      select: { id: true, subject: true, senderEmail: true, internalDate: true },
    });

    const wordCounts = new Map<string, number>();
    const urgentExamples: FlaggedSubjectDto[] = [];
    let urgentCount = 0;

    for (const message of messages) {
      if (!message.subject) continue;

      for (const token of message.subject.toLowerCase().split(/[^a-z0-9]+/)) {
        if (token.length < MIN_TOKEN_LENGTH || STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
        wordCounts.set(token, (wordCounts.get(token) ?? 0) + 1);
      }

      if (URGENCY_PATTERN.test(message.subject)) {
        urgentCount++;
        if (urgentExamples.length < MAX_URGENT_EXAMPLES) {
          urgentExamples.push({
            id: message.id,
            subject: message.subject,
            senderEmail: message.senderEmail,
            internalDate: message.internalDate.toISOString(),
          });
        }
      }
    }

    const topKeywords = [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_KEYWORD_COUNT)
      .map(([word, count]) => ({ word, count }));

    return { topKeywords, urgentCount, urgentExamples };
  }

  async unsubscribeCandidates(mailboxAccountId: string): Promise<UnsubscribeCandidatesResponse> {
    const senders = await this.prisma.sender.findMany({
      where: { mailboxAccountId, messageCount: { gte: MIN_UNSUBSCRIBE_MESSAGE_COUNT } },
      orderBy: { messageCount: "desc" },
    });

    const items = senders
      .map((sender) => ({
        emailAddress: sender.emailAddress,
        displayName: sender.displayName,
        messageCount: sender.messageCount,
        unreadCount: sender.unreadCount,
        unreadRate: sender.messageCount > 0 ? sender.unreadCount / sender.messageCount : 0,
        lastMessageAt: sender.lastMessageAt?.toISOString() ?? null,
      }))
      .filter((sender) => sender.unreadRate >= MIN_UNSUBSCRIBE_UNREAD_RATE)
      .slice(0, MAX_UNSUBSCRIBE_CANDIDATES);

    return { items };
  }
}
