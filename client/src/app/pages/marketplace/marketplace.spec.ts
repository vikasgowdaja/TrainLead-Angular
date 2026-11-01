import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DashboardStats, RequirementSummary } from '@trainlead/shared/domain';
import type { Role } from '@trainlead/shared';
import { AuthService } from '../../core/auth/auth.service';
import { MarketplacePage } from './marketplace';

function signInAs(role: Role): void {
  TestBed.inject(AuthService).login({ identifier: 'a@b.co', password: 'secret' }).subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/auth/login')
    .flush({ data: { accessToken: 'token', user: { id: '1', name: 'Ananya Rao', email: 'a@b.co', phone: null, role, organizationId: null } } });
}

const summary: RequirementSummary = {
  id: 'req-1', title: 'AngularJS foundations', skills: ['AngularJS'], city: 'Mysuru', state: 'Karnataka',
  mode: 'Offline', startDate: '2026-11-02', endDate: '2026-11-07', durationDays: 6,
  audience: '6th semester engineering students', studentCount: 60, travel: 'Provided', food: 'Provided', stay: 'Provided',
  paymentDueDate: null, status: 'Open', organization: { id: 'org-1', name: 'SkillBridge Academy' },
  groupId: null, groupSize: 1, sourceCount: 1, pendingApplications: 0, vendors: [{ id: 'org-1', name: 'SkillBridge Academy' }],
  canManage: false, createdAt: '2026-11-01T04:00:00.000Z', updatedAt: '2026-11-01T04:00:00.000Z',
};

const stats: DashboardStats = {
  activeOpportunities: 1, openOpportunities: 1, newThisWeek: 1, repeatedGroups: 0, withPaymentDate: 0,
  vendors: 1, sourcePosts: 1, inboxPending: 0, lastUpdatedAt: '2026-11-01T04:00:00.000Z',
  topVendors: [{ id: 'org-1', name: 'SkillBridge Academy', sourceCount: 1 }],
};

function flushDashboard(fixture: ReturnType<typeof TestBed.createComponent<MarketplacePage>>): void {
  const http = TestBed.inject(HttpTestingController);
  http.expectOne((request) => request.url === '/api/requirements').flush({ data: [summary], page: 1, limit: 10, total: 1, hasMore: false });
  http.expectOne('/api/requirements/stats').flush({ data: stats });
  fixture.detectChanges();
}

describe('MarketplacePage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketplacePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
  });

  it('shows live requirements and stats returned by the API', () => {
    signInAs('Trainer');
    const fixture = TestBed.createComponent(MarketplacePage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.requirement-skeleton')).not.toBeNull();
    flushDashboard(fixture);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Requirements');
    expect(compiled.querySelectorAll('app-requirement-card').length).toBe(1);
    expect(compiled.textContent).toContain('AngularJS foundations');
    expect(compiled.textContent).toContain('SkillBridge Academy');
    expect(compiled.querySelector('.overview-main strong')?.textContent).toContain('1');
    expect(compiled.querySelector('.apply-cta')?.textContent).toContain('View & apply');
    expect(compiled.querySelector('.profile-avatar')?.textContent).toBe('AR');
  });

  it('switches to the incoming posts when Inbox is selected', () => {
    signInAs('Trainer');
    const fixture = TestBed.createComponent(MarketplacePage);
    fixture.detectChanges();
    flushDashboard(fixture);
    const inboxTab = fixture.nativeElement.querySelectorAll('.nav-tab')[1] as HTMLButtonElement;

    inboxTab.click();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Inbox');
    const inboxRequest = TestBed.inject(HttpTestingController).expectOne('/api/inbox?page=1&limit=20');
    inboxRequest.flush({ data: [{
      id: 'inbox-1', rawText: 'AngularJS training in Mysuru', sourceType: 'WhatsApp', groupName: 'Trainer group',
      senderName: '', receivedAt: '2026-11-01T09:00:00.000Z', status: 'Extracted', error: null,
      extracted: {}, missingFields: [], requirementId: null, organization: null, createdAt: '2026-11-01T09:00:00.000Z',
    }], page: 1, limit: 20, total: 1, hasMore: false });
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.inbox-post').length).toBe(1);
    expect(compiled.textContent).toContain('AngularJS training in Mysuru');
  });

  it('shows the Users link only to admins', () => {
    signInAs('Trainer');
    const trainerView = TestBed.createComponent(MarketplacePage);
    trainerView.detectChanges();
    flushDashboard(trainerView);
    expect((trainerView.nativeElement as HTMLElement).querySelector('a[href="/admin/users"]')).toBeNull();
  });

  it('shows vendor application notifications linked to the matching application', () => {
    signInAs('Vendor');
    const fixture = TestBed.createComponent(MarketplacePage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const notification = {
      applicationId: 'app-1', requirementId: 'req-1', requirementTitle: 'AngularJS foundations',
      trainerName: 'Ananya Rao', status: 'Applied', createdAt: '2026-11-01T04:00:00.000Z', updatedAt: '2026-11-01T04:00:00.000Z',
    };
    http.expectOne('/api/applications/notifications').flush({ data: [notification], pendingCount: 1 });
    http.expectOne('/api/organizations/me').flush({ error: 'Organization setup required' }, { status: 409, statusText: 'Conflict' });
    flushDashboard(fixture);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.notification-toggle')?.click();
    fixture.detectChanges();
    http.expectOne('/api/applications/notifications').flush({ data: [notification], pendingCount: 1 });
    fixture.detectChanges();

    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.notification-entry');
    expect(link?.getAttribute('href')).toBe('/requirements/req-1#application-app-1');
    expect(link?.textContent).toContain('Ananya Rao');
    expect((fixture.nativeElement as HTMLElement).querySelector('.notification-count')?.textContent).toBe('1');
  });
});
