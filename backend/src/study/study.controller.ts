import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.service.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { LearnQueueQuery, PracticeQuery, ReviewDto, ReviewQueueQuery, StartCardDto } from './study.dto.js';
import { StudyService } from './study.service.js';

@Controller('study')
@UseGuards(SessionGuard)
export class StudyController {
  constructor(private readonly study: StudyService) {}

  /** Dashboard numbers: due count, today's goal, streak, mastery, 7-day forecast. */
  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.study.summary(user.id);
  }

  /** Progress page: heatmap, mastery, per level/topic, forecast, weekly recall. */
  @Get('progress')
  progress(@CurrentUser() user: AuthUser) {
    return this.study.progress(user.id);
  }

  /** New words for a learning session, plus quiz distractors. */
  @Get('learn')
  learnQueue(@Query() query: LearnQueueQuery, @CurrentUser() user: AuthUser) {
    return this.study.learnQueue(user.id, query);
  }

  @Post('cards')
  @HttpCode(200)
  startCard(@Body() dto: StartCardDto, @CurrentUser() user: AuthUser) {
    return this.study.startCard(user.id, dto);
  }

  @Delete('cards/:wordId')
  @HttpCode(204)
  resetCard(@Param('wordId', ParseUUIDPipe) wordId: string, @CurrentUser() user: AuthUser) {
    return this.study.resetCard(user.id, wordId);
  }

  /** Due flashcards, with the next due date for each rating. */
  @Get('review')
  reviewQueue(@Query() query: ReviewQueueQuery, @CurrentUser() user: AuthUser) {
    return this.study.reviewQueue(user.id, query.limit);
  }

  @Get('practice')
  practiceQueue(@Query() query: PracticeQuery, @CurrentUser() user: AuthUser) {
    return this.study.practiceQueue(user.id, query);
  }

  @Post('review')
  @HttpCode(200)
  submitReview(@Body() dto: ReviewDto, @CurrentUser() user: AuthUser) {
    return this.study.submitReview(user.id, dto);
  }
}
