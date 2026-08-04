import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { InsightsController } from "./insights.controller";
import { InsightsService } from "./insights.service";

@Module({
  imports: [AuthModule, MailboxModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
