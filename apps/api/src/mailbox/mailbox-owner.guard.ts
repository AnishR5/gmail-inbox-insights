import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedRequest } from "../auth/session.guard";

/**
 * Runs after SessionGuard. Confirms the :id route param is a mailbox
 * account owned by the caller before any sync/senders/actions handler runs —
 * 404 (not 403) so we don't confirm other users' mailbox ids exist.
 */
@Injectable()
export class MailboxOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const mailboxAccountId = req.params.id;
    const mailbox = await this.prisma.mailboxAccount.findUnique({ where: { id: mailboxAccountId } });
    if (!mailbox || mailbox.userId !== req.userId) {
      throw new NotFoundException("Mailbox not found");
    }
    return true;
  }
}
