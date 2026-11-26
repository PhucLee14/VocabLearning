import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { FeedbackService } from '../feedback/feedback.service.js';
import { AdminGuard } from './admin.guard.js';
import {
  AuditQuery,
  ImportCommitDto,
  ImportPreviewDto,
  ListAdminWordsQuery,
  ListFeedbackQuery,
  ListUsersQuery,
  MergeWordDto,
  ReorderTopicsDto,
  UpdateFeedbackDto,
  UpdateTopicDto,
  UpdateUserDto,
  UpdateWordDto,
} from './admin.dto.js';
import { AdminImportService } from './admin-import.service.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminTopicsService } from './admin-topics.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminWordsService } from './admin-words.service.js';
import { AuditService } from './audit.service.js';

const uuid = new ParseUUIDPipe();

/** Every /api/admin/* route: signed in (401) and an admin (403). Changes are written to the audit log. */
@Controller('admin')
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly stats: AdminStatsService,
    private readonly audit: AuditService,
    private readonly users: AdminUsersService,
    private readonly words: AdminWordsService,
    private readonly topics: AdminTopicsService,
    private readonly imports: AdminImportService,
    private readonly feedback: FeedbackService,
  ) {}

  @Get('stats')
  dashboard() {
    return this.stats.dashboard();
  }

  @Get('audit')
  auditLog(@Query() query: AuditQuery) {
    return this.audit.list(query);
  }

  // ───────────────────────────── Users ─────────────────────────────

  @Get('users')
  listUsers(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get('users/:id')
  user(@Param('id', uuid) id: string) {
    return this.users.detail(id);
  }

  @Patch('users/:id')
  updateUser(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(admin.id, id, dto);
  }

  @Post('users/:id/revoke-sessions')
  revokeSessions(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string) {
    return this.users.revokeSessions(admin.id, id);
  }

  // ───────────────────────────── Words ─────────────────────────────

  @Get('words')
  listWords(@Query() query: ListAdminWordsQuery) {
    return this.words.list(query);
  }

  @Get('words/parts-of-speech')
  partsOfSpeech() {
    return this.words.partsOfSpeech();
  }

  @Get('words/:id')
  word(@Param('id', uuid) id: string) {
    return this.words.detail(id);
  }

  @Post('words')
  createWord(@CurrentUser() admin: AuthUser, @Body() dto: UpdateWordDto) {
    return this.words.create(admin.id, dto);
  }

  @Patch('words/:id')
  updateWord(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: UpdateWordDto) {
    return this.words.update(admin.id, id, dto);
  }

  @Delete('words/:id')
  @HttpCode(204)
  deleteWord(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string) {
    return this.words.remove(admin.id, id);
  }

  @Post('words/:id/merge')
  mergeWord(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: MergeWordDto) {
    return this.words.merge(admin.id, id, dto.intoId);
  }

  // ───────────────────────────── Topics ─────────────────────────────

  @Get('topics')
  topicTree() {
    return this.topics.tree();
  }

  @Post('topics')
  createTopic(@CurrentUser() admin: AuthUser, @Body() dto: UpdateTopicDto) {
    return this.topics.create(admin.id, dto);
  }

  @Put('topics/order')
  @HttpCode(204)
  reorderTopics(@CurrentUser() admin: AuthUser, @Body() dto: ReorderTopicsDto) {
    return this.topics.reorder(admin.id, dto.ids);
  }

  @Patch('topics/:id')
  updateTopic(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: UpdateTopicDto) {
    return this.topics.update(admin.id, id, dto);
  }

  @Delete('topics/:id')
  @HttpCode(204)
  deleteTopic(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string) {
    return this.topics.remove(admin.id, id);
  }

  // ───────────────────────────── Import ─────────────────────────────

  @Get('import')
  importHistory() {
    return this.imports.history();
  }

  /** Larger body limit than the rest of the API: see main.ts. */
  @Post('import/preview')
  previewImport(@CurrentUser() admin: AuthUser, @Body() dto: ImportPreviewDto) {
    return this.imports.preview(admin.id, dto);
  }

  @Post('import/:id/commit')
  commitImport(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: ImportCommitDto) {
    return this.imports.commit(admin.id, id, dto.content);
  }

  // ───────────────────────────── Feedback ─────────────────────────────

  @Get('feedback')
  listFeedback(@Query() query: ListFeedbackQuery) {
    return this.feedback.list(query);
  }

  @Patch('feedback/:id')
  async updateFeedback(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: UpdateFeedbackDto) {
    const result = await this.feedback.update(admin.id, id, dto);
    if (Object.keys(result.changes).length > 0 || result.mailed) {
      await this.audit.record(admin.id, 'feedback.update', { type: 'feedback', id }, {
        ...result.changes,
        ...(result.mailed ? { mailed: true } : {}),
      } as Prisma.InputJsonValue);
    }
    return { ...result.feedback, mailed: result.mailed };
  }
}
