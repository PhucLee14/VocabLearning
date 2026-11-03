import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.service.js';
import { CurrentUser, OptionalSessionGuard, SessionGuard } from '../auth/session.guard.js';
import { ListWordsQuery, SaveNoteDto } from './words.dto.js';
import { WordsService } from './words.service.js';

@Controller()
export class WordsController {
  constructor(private readonly words: WordsService) {}

  /** Word list. Signed-in users also get their progress per word and can filter by status. */
  @Get('words')
  @UseGuards(OptionalSessionGuard)
  list(@Query() query: ListWordsQuery, @CurrentUser() user?: AuthUser) {
    return this.words.list(query, user?.id);
  }

  @Get('words/:slug')
  @UseGuards(OptionalSessionGuard)
  detail(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.words.detail(slug, user?.id);
  }

  @Put('words/:slug/note')
  @UseGuards(SessionGuard)
  saveNote(@Param('slug') slug: string, @Body() dto: SaveNoteDto, @CurrentUser() user: AuthUser) {
    return this.words.saveNote(slug, user.id, dto.content);
  }

  /** Word counts per CEFR level, e.g. { "A1": 12, "B2": 30 }. */
  @Get('levels')
  levels() {
    return this.words.levels();
  }
}
