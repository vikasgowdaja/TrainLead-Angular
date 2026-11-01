import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { RequirementDetail, RequirementStatus } from '@trainlead/shared/domain';
import { finalize } from 'rxjs';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';

@Component({
  selector: 'app-requirement-detail',
  imports: [DatePipe, RouterLink],
  templateUrl: './requirement-detail.html',
})
export class RequirementDetailPage {
  private readonly api = inject(MarketplaceService);
  private readonly router = inject(Router);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  protected readonly requirement = signal<RequirementDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.getRequirement(this.id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ data }) => this.requirement.set(data),
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected changeStatus(status: RequirementStatus): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.api.changeStatus(this.id, status).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: ({ data }) => this.requirement.set(data),
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected edit(): void {
    void this.router.navigate(['/requirements', this.id, 'edit']);
  }

  protected duplicate(): void {
    this.api.duplicateRequirement(this.id).subscribe({
      next: ({ data }) => void this.router.navigate(['/requirements', data.id]),
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected remove(): void {
    if (!globalThis.confirm('Delete this requirement? This hides it from the marketplace but retains source history.')) return;
    this.saving.set(true);
    this.api.deleteRequirement(this.id).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected formatDate(value: string | null): string {
    return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : 'Not specified';
  }
}
