import { Types } from 'mongoose';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function notFound(what: string): HttpError {
  return new HttpError(404, `${what} not found`);
}

export function forbidden(message = 'You do not have permission to do this'): HttpError {
  return new HttpError(403, message);
}

export function parseBody<T extends z.ZodType>(schema: T, value: unknown, label = 'request'): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, `Invalid ${label}`, parsed.error.issues);
  }
  return parsed.data;
}

export function objectId(value: unknown, what = 'id'): Types.ObjectId {
  if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
    throw new HttpError(400, `Invalid ${what}`);
  }
  return new Types.ObjectId(value);
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
