import { Global, Module } from "@nestjs/common";
import { EncryptionService } from "./encryption.service";
import { GmailRateLimiterService } from "./gmail-rate-limiter.service";

@Global()
@Module({
  providers: [EncryptionService, GmailRateLimiterService],
  exports: [EncryptionService, GmailRateLimiterService],
})
export class CommonModule {}
