import { Logger } from "@nestjs/common";

const logger = new Logger("GmailRetry");

interface GaxiosLikeError {
  response?: { status?: number; headers?: Record<string, string> };
  code?: number | string;
  message?: string;
}

/**
 * Retries a single Gmail API call on 429 / 403 rateLimitExceeded / 5xx,
 * honoring Retry-After when Google sends one. Our own GmailRateLimiterService
 * keeps us under quota in the common case — this is the fallback for bursts
 * we didn't anticipate or transient Google-side errors.
 */
export async function callGmailWithRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      const gaxErr = err as GaxiosLikeError;
      const status = gaxErr.response?.status ?? Number(gaxErr.code);
      const retryable = status === 429 || status === 403 || (status !== undefined && status >= 500);
      if (!retryable || attempt >= maxAttempts) {
        throw err;
      }
      const retryAfterHeader = gaxErr.response?.headers?.["retry-after"];
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
      const backoffMs = retryAfterMs ?? Math.min(2 ** attempt * 250, 15_000) + Math.random() * 250;
      logger.warn(`Gmail API call failed (status=${status}, attempt=${attempt}/${maxAttempts}) — retrying in ${Math.round(backoffMs)}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}
