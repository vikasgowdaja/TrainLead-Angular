import { HttpErrorResponse } from '@angular/common/http';

export function describeHttpError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Something went wrong. Please try again.';
  }
  if (error.status === 0) {
    return 'Cannot reach the API. Is the server running on port 3000?';
  }
  const message: unknown = error.error?.error;
  return typeof message === 'string' ? message : 'Something went wrong. Please try again.';
}
