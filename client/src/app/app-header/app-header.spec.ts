import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Role } from '@trainlead/shared';
import type { TrainerNotificationView } from '@trainlead/shared/domain';
import { AuthService } from '../core/auth/auth.service';
import { AppHeader } from './app-header';

function signInAs(role: Role): void {
  TestBed.inject(AuthService).login({ identifier: 'a@b.co', password: 'secret' }).subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/auth/login')
    .flush({ data: { accessToken: 'token', user: { id: '1', name: 'Ananya Rao', email: 'a@b.co', phone: null, role, organizationId: null } } });
}

describe('AppHeader', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppHeader],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
  });

  it('shows trainer notifications, unread count, links, and account navigation', () => {
    signInAs('Trainer');
    const fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
    const notifications: TrainerNotificationView[] = [
      {
        id: 'notice-1', kind: 'NewRequirement', requirementId: 'req-1', applicationId: null,
        title: 'New matching training requirement', message: 'AngularJS foundations',
        createdAt: '2026-11-01T04:00:00.000Z', readAt: null,
      },
      {
        id: 'notice-2', kind: 'ApplicationUpdate', requirementId: 'req-1', applicationId: 'app-1',
        title: 'Application on hold', message: 'Please strengthen your project examples.',
        createdAt: '2026-11-01T05:00:00.000Z', readAt: null,
      },
    ];
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/applications/trainer/notifications').flush({ data: notifications, unreadCount: 2 });
    http.expectOne('/api/trainer-profile/me').flush({
      data: { id: '1', name: 'Ananya Rao', email: 'a@b.co', phone: null, photoUrl: 'https://res.cloudinary.com/trainlead/image/upload/trainer.jpg', resumeUrl: null, resumeFileName: null },
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.notification-count')?.textContent).toBe('2');
    expect(compiled.querySelector('.profile-photo')?.getAttribute('src')).toContain('trainer.jpg');
    compiled.querySelector<HTMLButtonElement>('.notification-toggle')?.click();
    compiled.querySelector<HTMLButtonElement>('.account-menu-toggle')?.click();
    fixture.detectChanges();
    http.expectOne('/api/applications/trainer/notifications').flush({ data: notifications, unreadCount: 2 });
    fixture.detectChanges();

    const entries = compiled.querySelectorAll<HTMLAnchorElement>('.notification-entry');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.getAttribute('href')).toBe('/requirements/req-1');
    expect(entries[1]?.getAttribute('href')).toBe('/requirements/req-1#application-app-1');
    expect(entries[1]?.textContent).toContain('Please strengthen your project examples.');
    expect(entries[0]?.classList.contains('is-unread')).toBe(true);
    expect(compiled.querySelector('a[href="/trainer/profile"]')).not.toBeNull();
    expect(compiled.querySelector('a[href="/skills"]')).not.toBeNull();
  });

  it('keeps vendor application alerts and organization links in the shared header', () => {
    signInAs('Vendor');
    const fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const notification = {
      applicationId: 'app-1', requirementId: 'req-1', requirementTitle: 'AngularJS foundations',
      trainerName: 'Ananya Rao', status: 'Applied', createdAt: '2026-11-01T04:00:00.000Z', updatedAt: '2026-11-01T04:00:00.000Z',
    };
    http.expectOne('/api/applications/notifications').flush({ data: [notification], pendingCount: 1 });
    http.expectOne('/api/organizations/me').flush({ error: 'Organization setup required' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.notification-count')?.textContent).toBe('1');
    compiled.querySelector<HTMLButtonElement>('.notification-toggle')?.click();
    fixture.detectChanges();
    http.expectOne('/api/applications/notifications').flush({ data: [notification], pendingCount: 1 });
    fixture.detectChanges();

    const link = compiled.querySelector<HTMLAnchorElement>('.notification-entry');
    expect(link?.getAttribute('href')).toBe('/requirements/req-1#application-app-1');
    expect(link?.textContent).toContain('Ananya Rao');
    compiled.querySelector<HTMLButtonElement>('.account-menu-toggle')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('a[href="/organization/new"]')).not.toBeNull();
  });
});