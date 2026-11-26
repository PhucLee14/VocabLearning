import { Module } from '@nestjs/common';
import { FeedbackModule } from '../feedback/feedback.module.js';
import { AdminController } from './admin.controller.js';
import { AdminGuard } from './admin.guard.js';
import { AdminImportService } from './admin-import.service.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminTopicsService } from './admin-topics.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminWordsService } from './admin-words.service.js';
import { AuditService } from './audit.service.js';

@Module({
  imports: [FeedbackModule],
  controllers: [AdminController],
  providers: [
    AdminGuard,
    AuditService,
    AdminStatsService,
    AdminUsersService,
    AdminWordsService,
    AdminTopicsService,
    AdminImportService,
  ],
})
export class AdminModule {}
