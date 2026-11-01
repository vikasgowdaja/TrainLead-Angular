import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { describeHttpError } from './http-error';

describe('describeHttpError', () => {
  it('explains rate limits and uses the Retry-After header', () => {
    const error = new HttpErrorResponse({
      status: 429,
      headers: new HttpHeaders({ 'Retry-After': '75' }),
      error: { message: 'Too many requests, please try again later.' },
    });

    expect(describeHttpError(error)).toBe('For security and site stability, repeated requests are temporarily limited. Please try again in about 2 minutes.');
  });

  it('gives a useful fallback when the server omits Retry-After', () => {
    const error = new HttpErrorResponse({ status: 429, error: { message: 'Too many requests' } });

    expect(describeHttpError(error)).toBe('For security and site stability, repeated requests are temporarily limited. Please try again in a few minutes.');
  });
});