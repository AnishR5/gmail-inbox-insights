import { randomUUID } from "node:crypto";
import { BadRequestException, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { GMAIL_MODIFY_SCOPE, GMAIL_READONLY_SCOPES, GoogleOAuthService } from "./google-oauth.service";
import { SessionGuard, type AuthenticatedRequest } from "./session.guard";
import { SessionService } from "./session.service";
import { CurrentUserId } from "./current-user.decorator";

const PKCE_COOKIE = "oauth_pkce_verifier";
const isProd = process.env.NODE_ENV === "production";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly google: GoogleOAuthService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get("google/login")
  async login(@Res() res: Response) {
    const { codeVerifier: verifier, codeChallenge } = await this.google.generatePkcePair();
    const state = this.sessions.signOAuthState({ nonce: randomUUID(), mode: "login" });
    res.cookie(PKCE_COOKIE, verifier, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
      path: "/auth/google",
    });
    const url = this.google.buildAuthUrl({ state, codeChallenge, scopes: GMAIL_READONLY_SCOPES });
    res.redirect(url);
  }

  @UseGuards(SessionGuard)
  @Get("google/upgrade-scope")
  async upgradeScope(@CurrentUserId() userId: string, @Res() res: Response) {
    const { codeVerifier: verifier, codeChallenge } = await this.google.generatePkcePair();
    const state = this.sessions.signOAuthState({ nonce: randomUUID(), mode: "upgrade", userId });
    res.cookie(PKCE_COOKIE, verifier, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
      path: "/auth/google",
    });
    const url = this.google.buildAuthUrl({
      state,
      codeChallenge,
      scopes: [...GMAIL_READONLY_SCOPES, GMAIL_MODIFY_SCOPE],
    });
    res.redirect(url);
  }

  @Get("google/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Req() req: Request, @Res() res: Response) {
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:5173";
    if (!code || !state) {
      throw new BadRequestException("Missing code or state");
    }

    let statePayload;
    try {
      statePayload = this.sessions.verifyOAuthState(state);
    } catch {
      throw new BadRequestException("Invalid or expired OAuth state");
    }

    const verifier = req.cookies?.[PKCE_COOKIE];
    if (!verifier) {
      throw new BadRequestException("Missing PKCE verifier cookie — please restart the login flow");
    }
    res.clearCookie(PKCE_COOKIE, { path: "/auth/google" });

    const tokens = await this.google.exchangeCode(code, verifier);

    if (statePayload.mode === "upgrade") {
      if (!statePayload.userId) {
        throw new BadRequestException("Malformed upgrade state");
      }
      await this.auth.completeScopeUpgrade(statePayload.userId, tokens);
      res.redirect(`${webOrigin}/dashboard?upgraded=1`);
      return;
    }

    const { user } = await this.auth.completeLogin(tokens);
    const session = this.sessions.signSession({ sub: user.id });
    res.cookie("session", session, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: this.sessions.sessionCookieMaxAgeMs,
      path: "/",
    });
    res.redirect(`${webOrigin}/dashboard`);
  }

  @Post("logout")
  async logout(@Res() res: Response) {
    res.clearCookie("session", { path: "/" });
    res.status(200).json({ ok: true });
  }

  @UseGuards(SessionGuard)
  @Get("me")
  async me(@CurrentUserId() userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { mailboxAccounts: { select: { id: true, gmailAddress: true } } },
    });
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      mailboxAccounts: user.mailboxAccounts,
    };
  }
}
