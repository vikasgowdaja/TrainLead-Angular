import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { AdminAnalytics, RequirementSummary } from '@trainlead/shared/domain';
import { REQUIREMENT_STATUSES } from '@trainlead/shared/domain';
import { forkJoin } from 'rxjs';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  imports: [DatePipe, RouterLink],
  templateUrl: './admin-dashboard.html',
})
export class AdminDashboardPage {
  private readonly api = inject(MarketplaceService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly analytics = signal<AdminAnalytics | null>(null);
  protected readonly requirements = signal<RequirementSummary[]>([]);
  protected readonly statuses = REQUIREMENT_STATUSES;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    forkJoin({
      analytics: this.api.getAdminAnalytics(),
      requirements: this.api.listRequirements({ sort: 'updated', page: 1, limit: 10 }),
    }).subscribe({
      next: ({ analytics, requirements }) => {
        this.analytics.set(analytics.data);
        this.requirements.set(requirements.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(describeHttpError(error));
        this.loading.set(false);
      },
    });
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigateByUrl('/login'));
  }
}
