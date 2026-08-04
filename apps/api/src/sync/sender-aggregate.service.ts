import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Rebuilds the `senders` table for one mailbox from `messages` in two set-based
 * SQL statements. Simpler and more robust against retried/resumed sync jobs
 * than incrementing counters per message (which risks double-counting on
 * replay); at the message volumes a personal mailbox has, a full GROUP BY is
 * still cheap. Revisit with real incremental counters if that stops being true.
 */
@Injectable()
export class SenderAggregateService {
  constructor(private readonly prisma: PrismaService) {}

  async recompute(mailboxAccountId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO senders (id, mailbox_account_id, email_address, display_name, message_count, unread_count, first_message_at, last_message_at, updated_at)
      SELECT gen_random_uuid(),
             m.mailbox_account_id,
             m.sender_email,
             (array_agg(m.sender_name ORDER BY m.internal_date DESC))[1],
             count(*)::int,
             count(*) FILTER (WHERE m.is_unread)::int,
             min(m.internal_date),
             max(m.internal_date),
             now()
      FROM messages m
      WHERE m.mailbox_account_id = ${mailboxAccountId}
        AND NOT ('TRASH' = ANY(m.label_ids))
      GROUP BY m.mailbox_account_id, m.sender_email
      ON CONFLICT (mailbox_account_id, email_address)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        message_count = EXCLUDED.message_count,
        unread_count = EXCLUDED.unread_count,
        first_message_at = EXCLUDED.first_message_at,
        last_message_at = EXCLUDED.last_message_at,
        updated_at = now()
    `;

    await this.prisma.$executeRaw`
      DELETE FROM senders s
      WHERE s.mailbox_account_id = ${mailboxAccountId}
        AND NOT EXISTS (
          SELECT 1 FROM messages m
          WHERE m.mailbox_account_id = s.mailbox_account_id
            AND m.sender_email = s.email_address
            AND NOT ('TRASH' = ANY(m.label_ids))
        )
    `;
  }
}
