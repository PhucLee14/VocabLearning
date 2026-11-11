import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Turns the Prisma errors a client can cause into proper HTTP statuses
 * instead of a 500: a unique-key race (P2002) is a 409, a missing row (P2025)
 * a 404. Anything else stays a generic 500 without internal details.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error.code === 'P2002') {
      res.status(409).json({ statusCode: 409, message: 'This already exists or was just changed. Try again.' });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ statusCode: 404, message: 'Not found' });
      return;
    }
    this.logger.error(`Prisma ${error.code}: ${error.message.split('\n').at(-1)}`);
    res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
