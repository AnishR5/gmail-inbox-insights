import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { MailboxOwnerGuard } from "../mailbox/mailbox-owner.guard";
import { ListSendersQueryDto } from "./list-senders-query.dto";
import { SendersService } from "./senders.service";

@UseGuards(SessionGuard, MailboxOwnerGuard)
@Controller("mailbox/:id/senders")
export class SendersController {
  constructor(private readonly senders: SendersService) {}

  @Get()
  async list(@Param("id") mailboxAccountId: string, @Query() query: ListSendersQueryDto) {
    return this.senders.list(mailboxAccountId, query);
  }

  @Get(":email")
  async detail(@Param("id") mailboxAccountId: string, @Param("email") email: string) {
    return this.senders.detail(mailboxAccountId, decodeURIComponent(email).toLowerCase());
  }
}
