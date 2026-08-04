import { Injectable } from "@nestjs/common";
import type { MailboxSummaryDto } from "@gmail-insights/shared";
import { PrismaService } from "../prisma/prisma.service";
import { GMAIL_MODIFY_SCOPE } from "../auth/google-oauth.service";

@Injectable()
export class MailboxService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(mailboxAccountId: string): Promise<MailboxSummaryDto> {
    const [mailbox, totalMessages, totalSenders, token] = await Promise.all([
      this.prisma.mailboxAccount.findUniqueOrThrow({ where: { id: mailboxAccountId } }),
      this.prisma.message.count({ where: { mailboxAccountId } }),
      this.prisma.sender.count({ where: { mailboxAccountId } }),
      this.prisma.oAuthToken.findUnique({ where: { mailboxAccountId } }),
    ]);

    return {
      id: mailbox.id,
      gmailAddress: mailbox.gmailAddress,
      syncStatus: mailbox.syncStatus,
      lastSyncedAt: mailbox.lastSyncedAt?.toISOString() ?? null,
      totalMessages,
      totalSenders,
      hasModifyScope: token?.scopes.includes(GMAIL_MODIFY_SCOPE) ?? false,
    };
  }
}
