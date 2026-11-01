import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import type { Role } from '@trainlead/shared';
import { AuthService } from './auth.service';

// Guards only improve navigation; the API enforces the same rules with 401/403.
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() || inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  return !inject(AuthService).isAuthenticated() || inject(Router).createUrlTree(['/']);
};

export function roleGuard(...roles: Role[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
    return auth.hasRole(...roles) || router.createUrlTree(['/forbidden']);
  };
}

export function safeReturnUrl(url: string | null): string {
  // Only same-app paths: "//evil.com" would otherwise be treated as another site.
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}
