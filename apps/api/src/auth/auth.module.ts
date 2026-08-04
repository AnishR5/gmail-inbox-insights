import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleOAuthService } from "./google-oauth.service";
import { SessionService } from "./session.service";
import { SessionGuard } from "./session.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthService, GoogleOAuthService, SessionService, SessionGuard],
  exports: [SessionService, SessionGuard, GoogleOAuthService, AuthService],
})
export class AuthModule {}
