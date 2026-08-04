import { Module } from "@nestjs/common";
import { Queue } from "bullmq";
import { bullmqConnection } from "./bullmq-connection";
import { QUEUE_BULK_ACTION, QUEUE_FULL_SYNC, QUEUE_INCREMENTAL_SYNC, QUEUE_SYNC_SCHEDULER } from "./queues";

export const FULL_SYNC_QUEUE = "FULL_SYNC_QUEUE";
export const INCREMENTAL_SYNC_QUEUE = "INCREMENTAL_SYNC_QUEUE";
export const BULK_ACTION_QUEUE = "BULK_ACTION_QUEUE";
export const SYNC_SCHEDULER_QUEUE = "SYNC_SCHEDULER_QUEUE";

@Module({
  providers: [
    { provide: FULL_SYNC_QUEUE, useFactory: () => new Queue(QUEUE_FULL_SYNC, { connection: bullmqConnection() }) },
    {
      provide: INCREMENTAL_SYNC_QUEUE,
      useFactory: () => new Queue(QUEUE_INCREMENTAL_SYNC, { connection: bullmqConnection() }),
    },
    { provide: BULK_ACTION_QUEUE, useFactory: () => new Queue(QUEUE_BULK_ACTION, { connection: bullmqConnection() }) },
    {
      provide: SYNC_SCHEDULER_QUEUE,
      useFactory: () => new Queue(QUEUE_SYNC_SCHEDULER, { connection: bullmqConnection() }),
    },
  ],
  exports: [FULL_SYNC_QUEUE, INCREMENTAL_SYNC_QUEUE, BULK_ACTION_QUEUE, SYNC_SCHEDULER_QUEUE],
})
export class SyncQueuesModule {}
