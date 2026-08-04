import { Injectable, Logger } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { gmail_v1, google } from "googleapis";
import { PrismaService } from "../prisma/prisma.service";
import { EncryptionService } from "../common/encryption.service";
import { GmailRateLimiterService } from "../common/gmail-rate-limiter.service";
import { GoogleOAuthService } from "../auth/google-oauth.service";

// Approximate Gmail API quota-unit costs, used only to size our own
// conservative rate limiter — not authoritative, tune against real usage.
export const GMAIL_COST = { LIST: 5, GET: 5, HISTORY_LIST: 2, BATCH_MODIFY: 50 };

export class NeedsReauthError extends Error {}

@Injectable()
export class GmailClientService {
  private readonly logger = new Logger(GmailClientService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly googleAuth: GoogleOAuthService,
    private readonly rateLimiter: GmailRateLimiterService,
  ) {}

  async forMailbox(mailboxAccountId: string): Promise<gmail_v1.Gmail> {
    const accessToken = await this.getValidAccessToken(mailboxAccountId);
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    return google.gmail({ version: "v1", auth });
  }

  private async getValidAccessToken(mailboxAccountId: string): Promise<string> {
    const token = await this.prisma.oAuthToken.findUnique({ where: { mailboxAccountId } });
    if (!token) {
      throw new NeedsReauthError(`No OAuth token stored for mailbox ${mailboxAccountId}`);
    }

    const expiresSoon = !token.accessTokenExpiresAt || token.accessTokenExpiresAt.getTime() < Date.now() + 60_000;
    if (token.encryptedAccessToken && !expiresSoon) {
      return this.encryption.decrypt(token.encryptedAccessToken);
    }

    const refreshToken = this.encryption.decrypt(token.encryptedRefreshToken);
    try {
      const { accessToken, expiresAt } = await this.googleAuth.refreshAccessToken(refreshToken);
      await this.prisma.oAuthToken.update({
        where: { mailboxAccountId },
        data: {
          encryptedAccessToken: this.encryption.encrypt(accessToken),
          accessTokenExpiresAt: expiresAt,
        },
      });
      return accessToken;
    } catch (err) {
      this.logger.warn(`Refresh grant failed for mailbox ${mailboxAccountId}: ${(err as Error).message}`);
      await this.prisma.mailboxAccount.update({
        where: { id: mailboxAccountId },
        data: { syncStatus: "needs_reauth", syncError: "Google refresh token was revoked or expired" },
      });
      throw new NeedsReauthError("Refresh token invalid — user must reconnect their Google account");
    }
  }

  async acquireQuota(mailboxAccountId: string, cost: number) {
    await this.rateLimiter.acquire(mailboxAccountId, cost);
  }
}
