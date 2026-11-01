import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Role } from '@trainlead/shared';
import { AuthService } from '../../core/auth/auth.service';
import { MarketplacePage } from './marketplace';

function signInAs(role: Role): void {
  TestBed.inject(AuthService).login({ identifier: 'a@b.co', password: 'secret' }).subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/auth/login')
    .flush({ data: { accessToken: 'token', user: { id: '1', name: 'Ananya Rao', email: 'a@b.co', phone: null, role } } });
}

describe('MarketplacePage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketplacePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
  });

  it('shows the requirements view and demo opportunities by default', () => {
    signInAs('Trainer');
    const fixture = TestBed.createComponent(MarketplacePage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Requirements');
    expect(compiled.querySelectorAll('app-requirement-card').length).toBe(3);
    expect(compiled.textContent).toContain('Mysuru');
    expect(compiled.querySelector('.profile-avatar')?.textContent).toBe('AR');
  });

  it('switches to the incoming posts when Inbox is selected', () => {
    signInAs('Trainer');
    const fixture = TestBed.createComponent(MarketplacePage);
    fixture.detectChanges();
    const inboxTab = fixture.nativeElement.querySelectorAll('.nav-tab')[1] as HTMLButtonElement;

    inboxTab.click();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Inbox');
    expect(compiled.querySelectorAll('.inbox-post').length).toBe(2);
  });

  it('shows the Users link only to admins', () => {
    signInAs('Trainer');
    const trainerView = TestBed.createComponent(MarketplacePage);
    trainerView.detectChanges();
    expect((trainerView.nativeElement as HTMLElement).querySelector('a[href="/admin/users"]')).toBeNull();

    signInAs('Admin');
    const adminView = TestBed.createComponent(MarketplacePage);
    adminView.detectChanges();
    expect((adminView.nativeElement as HTMLElement).querySelector('a[href="/admin/users"]')).not.toBeNull();
  });
});
