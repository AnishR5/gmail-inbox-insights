import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { MailboxOwnerGuard } from "../mailbox/mailbox-owner.guard";
import { InsightsService } from "./insights.service";
import { VolumeQueryDto } from "./volume-query.dto";

@UseGuards(SessionGuard, MailboxOwnerGuard)
@Controller("mailbox/:id/insights")
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get("volume")
  async volume(@Param("id") mailboxAccountId: string, @Query() query: VolumeQueryDto) {
    return this.insights.volume(mailboxAccountId, query.bucket, query.days);
  }

  @Get("categories")
  async categories(@Param("id") mailboxAccountId: string) {
    return this.insights.categories(mailboxAccountId);
  }

  @Get("unread")
  async unread(@Param("id") mailboxAccountId: string) {
    return this.insights.unread(mailboxAccountId);
  }

  @Get("subjects")
  async subjects(@Param("id") mailboxAccountId: string) {
    return this.insights.subjects(mailboxAccountId);
  }

  @Get("unsubscribe-candidates")
  async unsubscribeCandidates(@Param("id") mailboxAccountId: string) {
    return this.insights.unsubscribeCandidates(mailboxAccountId);
  }
}
