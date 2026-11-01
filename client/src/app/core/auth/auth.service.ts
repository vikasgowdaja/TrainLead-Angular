import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { AuthSession, AuthUser, LoginInput, RegisterInput, Role } from '@trainlead/shared';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap } from 'rxjs';

interface ApiResponse<T> {
  data: T;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  // The access token lives only in memory; the refresh token is an httpOnly cookie JS cannot read.
  private readonly session = signal<AuthSession | null>(null);
  private refreshInFlight: Observable<AuthSession> | null = null;

  readonly currentUser = computed<AuthUser | null>(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  hasRole(...roles: Role[]): boolean {
    const user = this.currentUser();
    return user !== null && roles.includes(user.role);
  }

  login(input: LoginInput): Observable<AuthUser> {
    return this.http.post<ApiResponse<AuthSession>>('/api/auth/login', input).pipe(map((response) => this.store(response.data)));
  }

  register(input: RegisterInput): Observable<AuthUser> {
    return this.http.post<ApiResponse<AuthSession>>('/api/auth/register', input).pipe(map((response) => this.store(response.data)));
  }

  // Requests that fail together share one refresh; parallel refreshes would trip reuse detection.
  refresh(): Observable<AuthSession> {
    this.refreshInFlight ??= this.http.post<ApiResponse<AuthSession>>('/api/auth/refresh', {}).pipe(
      map((response) => response.data),
      tap((session) => this.session.set(session)),
      finalize(() => (this.refreshInFlight = null)),
      shareReplay(1),
    );
    return this.refreshInFlight;
  }

  restoreSession(): Promise<void> {
    return firstValueFrom(
      this.refresh().pipe(
        map(() => undefined),
        catchError(() => of(undefined)),
      ),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      catchError(() => of(undefined)),
      finalize(() => this.clearSession()),
    );
  }

  clearSession(): void {
    this.session.set(null);
  }

  private store(session: AuthSession): AuthUser {
    this.session.set(session);
    return session.user;
  }
}
