import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { SenderDetailResponse, SenderDto, SenderListResponse } from "@gmail-insights/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { ListSendersQueryDto } from "./list-senders-query.dto";

const SORT_MAP: Record<ListSendersQueryDto["sort"], Prisma.SenderOrderByWithRelationInput> = {
  count: { messageCount: "desc" },
  unread: { unreadCount: "desc" },
  recent: { lastMessageAt: "desc" },
};

@Injectable()
export class SendersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(mailboxAccountId: string, query: ListSendersQueryDto): Promise<SenderListResponse> {
    const where: Prisma.SenderWhereInput = {
      mailboxAccountId,
      ...(query.search
        ? {
            OR: [
              { emailAddress: { contains: query.search, mode: "insensitive" } },
              { displayName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.sender.findMany({
        where,
        orderBy: SORT_MAP[query.sort],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.sender.count({ where }),
    ]);

    return {
      items: items.map(toSenderDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async detail(mailboxAccountId: string, emailAddress: string): Promise<SenderDetailResponse> {
    const sender = await this.prisma.sender.findUnique({
      where: { mailboxAccountId_emailAddress: { mailboxAccountId, emailAddress } },
    });
    if (!sender) {
      throw new NotFoundException("Sender not found");
    }
    const recentMessages = await this.prisma.message.findMany({
      where: { mailboxAccountId, senderEmail: emailAddress },
      orderBy: { internalDate: "desc" },
      take: 20,
      select: { id: true, subject: true, internalDate: true, isUnread: true },
    });

    return {
      ...toSenderDto(sender),
      recentMessages: recentMessages.map((m) => ({
        id: m.id,
        subject: m.subject,
        internalDate: m.internalDate.toISOString(),
        isUnread: m.isUnread,
      })),
    };
  }
}

export function toSenderDto(sender: {
  id: string;
  emailAddress: string;
  displayName: string | null;
  messageCount: number;
  unreadCount: number;
  firstMessageAt: Date | null;
  lastMessageAt: Date | null;
}): SenderDto {
  return {
    id: sender.id,
    emailAddress: sender.emailAddress,
    displayName: sender.displayName,
    messageCount: sender.messageCount,
    unreadCount: sender.unreadCount,
    firstMessageAt: sender.firstMessageAt?.toISOString() ?? null,
    lastMessageAt: sender.lastMessageAt?.toISOString() ?? null,
  };
}
