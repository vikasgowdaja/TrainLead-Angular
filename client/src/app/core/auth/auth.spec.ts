import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, type ActivatedRouteSnapshot, type CanActivateFn, type RouterStateSnapshot, UrlTree } from '@angular/router';
import type { Role } from '@trainlead/shared';
import { authGuard, roleGuard, safeReturnUrl } from './auth.guards';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

function session(role: Role, accessToken = 'token-1') {
  return { data: { accessToken, user: { id: '1', name: 'Test User', email: 't@x.co', phone: null, role } } };
}

describe('auth', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function signInAs(role: Role): void {
    TestBed.inject(AuthService).login({ identifier: 't@x.co', password: 'secret' }).subscribe();
    http.expectOne('/api/auth/login').flush(session(role));
  }

  function runGuard(guard: CanActivateFn, url: string): unknown {
    return TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
  }

  it('sends visitors to login and remembers where they were going', () => {
    const result = runGuard(authGuard, '/admin/users');

    expect(result instanceof UrlTree && result.toString()).toBe('/login?returnUrl=%2Fadmin%2Fusers');
  });

  it('blocks a Trainer from admin pages', () => {
    signInAs('Trainer');

    const result = runGuard(roleGuard('Admin'), '/admin/users');

    expect(result instanceof UrlTree && result.toString()).toBe('/forbidden');
  });

  it('lets an Admin into admin pages', () => {
    signInAs('Admin');

    expect(runGuard(roleGuard('Admin'), '/admin/users')).toBe(true);
  });

  it('attaches the access token to API requests', () => {
    signInAs('Vendor');

    TestBed.inject(HttpClient).get('/api/requirements').subscribe();

    expect(http.expectOne('/api/requirements').request.headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('refreshes once on 401 and retries with the new token', () => {
    signInAs('Vendor');
    let body: unknown;

    TestBed.inject(HttpClient).get('/api/requirements').subscribe((response) => (body = response));
    http.expectOne('/api/requirements').flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/auth/refresh').flush(session('Vendor', 'token-2'));
    const retry = http.expectOne('/api/requirements');
    retry.flush({ data: [] });

    expect(retry.request.headers.get('Authorization')).toBe('Bearer token-2');
    expect(body).toEqual({ data: [] });
  });

  it('only accepts same-app return URLs', () => {
    expect(safeReturnUrl('/admin/users')).toBe('/admin/users');
    expect(safeReturnUrl('//evil.example')).toBe('/');
    expect(safeReturnUrl('https://evil.example')).toBe('/');
    expect(safeReturnUrl(null)).toBe('/');
  });
});
