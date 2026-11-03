import { Module } from '@nestjs/common';
import { StudyController } from './study.controller.js';
import { StudyService } from './study.service.js';

@Module({
  controllers: [StudyController],
  providers: [StudyService],
})
export class StudyModule {}
