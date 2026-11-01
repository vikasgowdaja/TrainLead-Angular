import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { RequirementCard } from '../../requirement-card/requirement-card';
import { demoRequirements, inboxPosts } from '../../requirement.data';

@Component({
  selector: 'app-marketplace-page',
  imports: [RequirementCard, RouterLink],
  templateUrl: './marketplace.html',
})
export class MarketplacePage {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly activeView = signal<'requirements' | 'inbox'>('requirements');
  protected readonly darkMode = signal(false);
  protected readonly requirements = demoRequirements;
  protected readonly posts = inboxPosts;
  protected readonly initials = computed(() =>
    (this.auth.currentUser()?.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );

  protected setView(view: 'requirements' | 'inbox'): void {
    this.activeView.set(view);
  }

  protected toggleTheme(): void {
    this.darkMode.update((isDark) => !isDark);
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigateByUrl('/login'));
  }
}
