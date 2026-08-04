import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { SendersController } from "./senders.controller";
import { SendersService } from "./senders.service";

@Module({
  imports: [AuthModule, MailboxModule],
  controllers: [SendersController],
  providers: [SendersService],
})
export class SendersModule {}
