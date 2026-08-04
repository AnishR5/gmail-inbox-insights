import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { SessionService } from "./session.service";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.cookies?.session;
    if (!token) {
      throw new UnauthorizedException("Not signed in");
    }
    try {
      const payload = this.sessions.verifySession(token);
      req.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException("Session expired or invalid");
    }
  }
}
