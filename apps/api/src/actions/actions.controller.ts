import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { MailboxOwnerGuard } from "../mailbox/mailbox-owner.guard";
import { ActionsService } from "./actions.service";
import { CreateTrashActionDto } from "./create-trash-action.dto";

@UseGuards(SessionGuard, MailboxOwnerGuard)
@Controller("mailbox/:id/actions")
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Post("trash")
  async previewTrash(
    @Param("id") mailboxAccountId: string,
    @CurrentUserId() userId: string,
    @Body() body: CreateTrashActionDto,
  ) {
    return this.actions.previewTrash(mailboxAccountId, userId, body.senderEmail.toLowerCase());
  }

  @Post(":actionId/confirm")
  async confirm(@Param("id") mailboxAccountId: string, @Param("actionId") actionId: string) {
    return this.actions.confirm(mailboxAccountId, actionId);
  }

  @Post(":actionId/cancel")
  async cancel(@Param("id") mailboxAccountId: string, @Param("actionId") actionId: string) {
    return this.actions.cancel(mailboxAccountId, actionId);
  }

  @Get(":actionId")
  async get(@Param("id") mailboxAccountId: string, @Param("actionId") actionId: string) {
    return this.actions.get(mailboxAccountId, actionId);
  }

  @Get()
  async list(@Param("id") mailboxAccountId: string) {
    return this.actions.list(mailboxAccountId);
  }
}
