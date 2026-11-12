import { Global, Module } from '@nestjs/common';
import { AccountEmailService } from './account-email.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ConfirmCodeService } from './confirm-code.service.js';
import { OptionalSessionGuard, SessionGuard } from './session.guard.js';

// Global so every feature module can use SessionGuard / OptionalSessionGuard.
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AccountEmailService, ConfirmCodeService, SessionGuard, OptionalSessionGuard],
  exports: [AuthService, AccountEmailService, ConfirmCodeService, SessionGuard, OptionalSessionGuard],
})
export class AuthModule {}
