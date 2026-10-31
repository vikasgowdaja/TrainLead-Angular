import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('shows the requirements view and demo opportunities by default', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Requirements');
    expect(compiled.querySelectorAll('app-requirement-card').length).toBe(3);
    expect(compiled.textContent).toContain('Mysuru');
  });

  it('switches to the incoming posts when Inbox is selected', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const inboxTab = fixture.nativeElement.querySelectorAll('.nav-tab')[1] as HTMLButtonElement;

    inboxTab.click();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Inbox');
    expect(compiled.querySelectorAll('.inbox-post').length).toBe(2);
  });
});
