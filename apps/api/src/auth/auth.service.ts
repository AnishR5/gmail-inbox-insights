import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EncryptionService } from "../common/encryption.service";
import type { GoogleTokenResult } from "./google-oauth.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /** First login: upsert the user + their single mailbox account, store encrypted readonly-scope tokens. */
  async completeLogin(tokens: GoogleTokenResult) {
    const user = await this.prisma.user.upsert({
      where: { googleSub: tokens.idToken.sub },
      create: {
        googleSub: tokens.idToken.sub,
        email: tokens.idToken.email,
        displayName: tokens.idToken.name,
      },
      update: {
        email: tokens.idToken.email,
        displayName: tokens.idToken.name,
      },
    });

    const mailboxAccount = await this.prisma.mailboxAccount.upsert({
      where: { userId_gmailAddress: { userId: user.id, gmailAddress: tokens.idToken.email } },
      create: {
        userId: user.id,
        gmailAddress: tokens.idToken.email,
        syncStatus: "idle",
      },
      update: { syncStatus: "idle", syncError: null },
    });

    await this.storeTokens(mailboxAccount.id, tokens);

    return { user, mailboxAccount };
  }

  /** Incremental-auth completion: same user, wider scope set (readonly + modify). */
  async completeScopeUpgrade(userId: string, tokens: GoogleTokenResult) {
    const mailboxAccount = await this.prisma.mailboxAccount.findFirstOrThrow({
      where: { userId, gmailAddress: tokens.idToken.email },
    });
    await this.storeTokens(mailboxAccount.id, tokens);
    return mailboxAccount;
  }

  private async storeTokens(mailboxAccountId: string, tokens: GoogleTokenResult) {
    await this.prisma.oAuthToken.upsert({
      where: { mailboxAccountId },
      create: {
        mailboxAccountId,
        encryptedRefreshToken: this.encryption.encrypt(tokens.refreshToken),
        encryptedAccessToken: tokens.accessToken ? this.encryption.encrypt(tokens.accessToken) : null,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        scopes: tokens.scopes,
      },
      update: {
        encryptedRefreshToken: this.encryption.encrypt(tokens.refreshToken),
        encryptedAccessToken: tokens.accessToken ? this.encryption.encrypt(tokens.accessToken) : null,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        scopes: tokens.scopes,
      },
    });
  }

  async hasModifyScope(mailboxAccountId: string): Promise<boolean> {
    const token = await this.prisma.oAuthToken.findUnique({ where: { mailboxAccountId } });
    return token?.scopes.includes("https://www.googleapis.com/auth/gmail.modify") ?? false;
  }
}
