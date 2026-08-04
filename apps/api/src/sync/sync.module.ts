import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { SyncQueuesModule } from "./sync-queues.module";
import { SyncController } from "./sync.controller";
import { GmailClientService } from "./gmail-client.service";
import { SenderAggregateService } from "./sender-aggregate.service";
import { MessageUpsertService } from "./message-upsert.service";
import { FullSyncProcessor } from "./processors/full-sync.processor";
import { IncrementalSyncProcessor } from "./processors/incremental-sync.processor";
import { SyncSchedulerProcessor } from "./processors/sync-scheduler.processor";

@Module({
  imports: [AuthModule, MailboxModule, SyncQueuesModule],
  controllers: [SyncController],
  providers: [
    GmailClientService,
    SenderAggregateService,
    MessageUpsertService,
    FullSyncProcessor,
    IncrementalSyncProcessor,
    SyncSchedulerProcessor,
  ],
  exports: [SyncQueuesModule, SenderAggregateService, GmailClientService],
})
export class SyncModule {}
