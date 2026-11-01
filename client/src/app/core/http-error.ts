import { HttpErrorResponse } from '@angular/common/http';

function retryAfterMinutes(error: HttpErrorResponse): number | null {
  const retryAfter = error.headers.get('Retry-After');
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  const remainingSeconds = Number.isFinite(seconds)
    ? seconds
    : (Date.parse(retryAfter) - Date.now()) / 1000;
  return Number.isFinite(remainingSeconds) && remainingSeconds > 0
    ? Math.ceil(remainingSeconds / 60)
    : null;
}

export function describeHttpError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Something went wrong. Please try again.';
  }
  if (error.status === 0) {
    return 'Cannot reach the API. Is the server running on port 3000?';
  }
  if (error.status === 429) {
    const minutes = retryAfterMinutes(error);
    const wait = minutes === null
      ? 'a few minutes'
      : `about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    return `For security and site stability, repeated requests are temporarily limited. Please try again in ${wait}.`;
  }
  const message: unknown = error.error?.error;
  const details: unknown = error.error?.details;
  if (typeof message === 'string' && Array.isArray(details)) {
    const firstIssue = details.find((issue: unknown) =>
      typeof issue === 'object' && issue !== null && 'message' in issue && typeof issue.message === 'string',
    ) as { message?: string } | undefined;
    if (firstIssue?.message) return `${message}: ${firstIssue.message}`;
  }
  return typeof message === 'string' ? message : 'Something went wrong. Please try again.';
}
