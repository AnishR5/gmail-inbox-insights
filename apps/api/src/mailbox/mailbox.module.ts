import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailboxController } from "./mailbox.controller";
import { MailboxService } from "./mailbox.service";
import { MailboxOwnerGuard } from "./mailbox-owner.guard";

@Module({
  imports: [AuthModule],
  controllers: [MailboxController],
  providers: [MailboxService, MailboxOwnerGuard],
  exports: [MailboxService, MailboxOwnerGuard],
})
export class MailboxModule {}
