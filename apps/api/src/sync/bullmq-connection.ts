import type { ConnectionOptions } from "bullmq";

export function bullmqConnection(): ConnectionOptions {
  return {
    url: process.env.REDIS_URL,
    maxRetriesPerRequest: null,
  } as ConnectionOptions;
}
