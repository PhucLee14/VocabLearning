import { ValidateIf } from 'class-validator';

/**
 * Like `@IsOptional()`, but only for a missing field: an explicit `null` is
 * still validated (and rejected). Use it on fields whose DB column is NOT
 * NULL; `@IsOptional()` would let `null` through to Prisma and cause a 500.
 */
export const IsOptionalNotNull = () => ValidateIf((_object, value) => value !== undefined);
