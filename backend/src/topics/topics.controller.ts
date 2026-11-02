import { Controller, Get } from '@nestjs/common';
import { TopicsService } from './topics.service.js';

@Controller('topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  findTree() {
    return this.topics.findTree();
  }
}
