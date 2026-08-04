import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import jwt from "jsonwebtoken";

export interface SessionPayload {
  sub: string; // userId
}

export interface OAuthStatePayload {
  nonce: string;
  mode: "login" | "upgrade";
  userId?: string;
}

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

@Injectable()
export class SessionService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>("SESSION_SECRET");
  }

  signSession(payload: SessionPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: SESSION_TTL_SECONDS });
  }

  verifySession(token: string): SessionPayload {
    return jwt.verify(token, this.secret) as SessionPayload;
  }

  signOAuthState(payload: OAuthStatePayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: OAUTH_STATE_TTL_SECONDS });
  }

  verifyOAuthState(token: string): OAuthStatePayload {
    return jwt.verify(token, this.secret) as OAuthStatePayload;
  }

  get sessionCookieMaxAgeMs(): number {
    return SESSION_TTL_SECONDS * 1000;
  }
}
