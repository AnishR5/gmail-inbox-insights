import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { SyncModule } from "../sync/sync.module";
import { ActionsController } from "./actions.controller";
import { ActionsService } from "./actions.service";
import { BulkActionProcessor } from "./processors/bulk-action.processor";

@Module({
  imports: [AuthModule, MailboxModule, SyncModule],
  controllers: [ActionsController],
  providers: [ActionsService, BulkActionProcessor],
})
export class ActionsModule {}
