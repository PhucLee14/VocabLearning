import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OptionalSessionGuard, SessionGuard } from './session.guard.js';

// Global so every feature module can use SessionGuard / OptionalSessionGuard.
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, OptionalSessionGuard],
  exports: [AuthService, SessionGuard, OptionalSessionGuard],
})
export class AuthModule {}
