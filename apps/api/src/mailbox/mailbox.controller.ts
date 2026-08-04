import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { MailboxOwnerGuard } from "./mailbox-owner.guard";
import { MailboxService } from "./mailbox.service";

@UseGuards(SessionGuard, MailboxOwnerGuard)
@Controller("mailbox/:id")
export class MailboxController {
  constructor(private readonly mailbox: MailboxService) {}

  @Get()
  async getSummary(@Param("id") id: string) {
    return this.mailbox.getSummary(id);
  }
}
