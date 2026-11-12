import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { StudyModule } from './study/study.module.js';
import { TopicsModule } from './topics/topics.module.js';
import { UsersModule } from './users/users.module.js';
import { WordsModule } from './words/words.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    PrismaModule,
    MailModule,
    RateLimitModule,
    HealthModule,
    AuthModule,
    TopicsModule,
    WordsModule,
    StudyModule,
    UsersModule,
  ],
})
export class AppModule {}
