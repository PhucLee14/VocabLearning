import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.service.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { CreateFeedbackDto } from './feedback.dto.js';
import { FeedbackService } from './feedback.service.js';

/** The learner's side of feedback: send it, read the replies. The admin side is in src/admin/. */
@Controller('feedback')
@UseGuards(SessionGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFeedbackDto) {
    return this.feedback.create(user.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.feedback.mine(user.id);
  }

  /** Marks every reply as read (the "My feedback" page calls it once it has shown them). */
  @Post('mine/seen')
  @HttpCode(204)
  markSeen(@CurrentUser() user: AuthUser) {
    return this.feedback.markSeen(user.id);
  }
}
