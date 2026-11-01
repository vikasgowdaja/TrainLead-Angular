import { HttpErrorResponse } from '@angular/common/http';

export function describeHttpError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Something went wrong. Please try again.';
  }
  if (error.status === 0) {
    return 'Cannot reach the API. Is the server running on port 3000?';
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
