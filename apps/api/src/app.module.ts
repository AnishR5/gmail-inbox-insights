import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./common/env.validation";
import { RedisModule } from "./common/redis.module";
import { CommonModule } from "./common/common.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { MailboxModule } from "./mailbox/mailbox.module";
import { SyncModule } from "./sync/sync.module";
import { SendersModule } from "./senders/senders.module";
import { InsightsModule } from "./insights/insights.module";
import { ActionsModule } from "./actions/actions.module";
import { AppController } from "./app.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    RedisModule,
    CommonModule,
    PrismaModule,
    AuthModule,
    MailboxModule,
    SyncModule,
    SendersModule,
    InsightsModule,
    ActionsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
