import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service.js';

/**
 * Lets only admins through. Use after SessionGuard, which attaches the user:
 * `@UseGuards(SessionGuard, AdminGuard)`. The role is read from the database
 * with the session on every request, so a demotion takes effect at once.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (user?.role === 'ADMIN') return true;
    throw new ForbiddenException('Admins only');
  }
}
