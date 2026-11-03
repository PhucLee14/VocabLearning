import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type AuthUser, AuthService } from './auth.service.js';
import { SESSION_COOKIE, setSessionCookie } from './session-cookie.js';

type AuthedRequest = Request & { user?: AuthUser; sessionToken?: string };

async function attachUser(context: ExecutionContext, auth: AuthService): Promise<boolean> {
  const req = context.switchToHttp().getRequest<AuthedRequest>();
  const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (!token) return false;

  const resolved = await auth.resolveSession(token);
  if (!resolved) return false;

  req.user = resolved.user;
  req.sessionToken = token;
  // Re-send the cookie so the browser's expiry follows the extended session.
  if (resolved.touched) setSessionCookie(context.switchToHttp().getResponse<Response>(), token);
  return true;
}

/** Requires a signed-in user (401 otherwise). Use with @CurrentUser(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    if (await attachUser(context, this.auth)) return true;
    throw new UnauthorizedException('Sign in first');
  }
}

/** Attaches the user when signed in, but also lets anonymous requests through. */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    await attachUser(context, this.auth);
    return true;
  }
}

/** The signed-in user (undefined behind OptionalSessionGuard for anonymous requests). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<AuthedRequest>().user,
);

/** The raw session token of the current request. */
export const SessionToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthedRequest>().sessionToken,
);
