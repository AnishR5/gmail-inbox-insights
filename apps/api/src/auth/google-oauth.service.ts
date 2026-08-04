import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";

export const GMAIL_READONLY_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];
export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export interface GoogleTokenResult {
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  scopes: string[];
  idToken: {
    sub: string;
    email: string;
    name?: string;
  };
}

@Injectable()
export class GoogleOAuthService {
  private readonly client: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    this.client = new OAuth2Client({
      clientId: config.get<string>("GOOGLE_CLIENT_ID"),
      clientSecret: config.get<string>("GOOGLE_CLIENT_SECRET"),
      redirectUri: config.get<string>("GOOGLE_OAUTH_REDIRECT_URI"),
    });
  }

  async generatePkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    const { codeVerifier, codeChallenge } = await this.client.generateCodeVerifierAsync();
    if (!codeChallenge) {
      throw new Error("google-auth-library did not return a PKCE code_challenge");
    }
    return { codeVerifier, codeChallenge };
  }

  buildAuthUrl(opts: { state: string; codeChallenge: string; scopes: string[] }): string {
    return this.client.generateAuthUrl({
      access_type: "offline",
      // Force the consent screen so Google always issues a refresh_token,
      // both on first login and when we later ask for the modify scope.
      prompt: "consent",
      scope: opts.scopes,
      state: opts.state,
      code_challenge: opts.codeChallenge,
      code_challenge_method: "S256" as any,
    });
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokenResult> {
    const { tokens } = await this.client.getToken({ code, codeVerifier } as any);
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh_token. This can happen if the account already granted consent without 'prompt=consent'.",
      );
    }
    if (!tokens.id_token) {
      throw new Error("Google did not return an id_token");
    }
    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.config.get<string>("GOOGLE_CLIENT_ID"),
    });
    const claims = ticket.getPayload();
    if (!claims?.sub || !claims.email) {
      throw new Error("Google id_token missing sub/email claims");
    }

    return {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? "",
      accessTokenExpiresAt: new Date(tokens.expiry_date ?? Date.now() + 55 * 60 * 1000),
      scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
      idToken: { sub: claims.sub, email: claims.email, name: claims.name },
    };
  }

  /** Exchanges a stored refresh token for a fresh access token. */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
    this.client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new Error("Google refresh grant did not return an access_token");
    }
    return {
      accessToken: credentials.access_token,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + 55 * 60 * 1000),
    };
  }
}
