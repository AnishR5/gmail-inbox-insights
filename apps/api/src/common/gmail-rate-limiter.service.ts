import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "./redis.module";

// Gmail's default per-user quota is 250 quota units/second. We stay well
// under that so a runaway sync never trips Google's own rate limiter.
const UNITS_PER_SECOND_BUDGET = 150;

/**
 * Redis-backed fixed-window token bucket, keyed per mailbox account so one
 * user's sync can't starve another's, and so concurrent API instances share
 * the same budget instead of each assuming they own the full quota.
 */
@Injectable()
export class GmailRateLimiterService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async acquire(mailboxAccountId: string, costUnits: number): Promise<void> {
    for (;;) {
      const windowKey = `gmail-quota:${mailboxAccountId}:${Math.floor(Date.now() / 1000)}`;
      const used = await this.redis.incrby(windowKey, costUnits);
      if (used === costUnits) {
        // first write in this window: set the key to expire with the window
        await this.redis.pexpire(windowKey, 1100);
      }
      if (used <= UNITS_PER_SECOND_BUDGET) {
        return;
      }
      // Over budget for this second: undo our reservation and wait for the next window.
      await this.redis.decrby(windowKey, costUnits);
      await sleep(50 + Math.random() * 50);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
