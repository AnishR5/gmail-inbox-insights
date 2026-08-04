import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { parseFromHeader } from "./parse-from-header";

interface GmailMetadataMessage {
  id?: string | null;
  threadId?: string | null;
  internalDate?: string | null;
  labelIds?: string[] | null;
  sizeEstimate?: number | null;
  payload?: { headers?: Array<{ name?: string | null; value?: string | null }> | null } | null;
}

@Injectable()
export class MessageUpsertService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFromMetadata(mailboxAccountId: string, msg: GmailMetadataMessage): Promise<void> {
    if (!msg.id) return;
    const fromHeader = msg.payload?.headers?.find((h) => h.name?.toLowerCase() === "from")?.value;
    const subjectHeader = msg.payload?.headers?.find((h) => h.name?.toLowerCase() === "subject")?.value;
    const { email, name } = parseFromHeader(fromHeader);
    const labelIds = msg.labelIds ?? [];

    await this.prisma.message.upsert({
      where: { id: msg.id },
      create: {
        id: msg.id,
        mailboxAccountId,
        threadId: msg.threadId ?? msg.id,
        senderEmail: email,
        senderName: name,
        subject: subjectHeader ?? null,
        internalDate: new Date(Number(msg.internalDate ?? Date.now())),
        isUnread: labelIds.includes("UNREAD"),
        labelIds,
        sizeEstimate: msg.sizeEstimate ?? null,
      },
      update: {
        senderEmail: email,
        senderName: name,
        subject: subjectHeader ?? null,
        isUnread: labelIds.includes("UNREAD"),
        labelIds,
        syncedAt: new Date(),
      },
    });
  }

  async delete(messageId: string): Promise<void> {
    await this.prisma.message.deleteMany({ where: { id: messageId } });
  }
}
