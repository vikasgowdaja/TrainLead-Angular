import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { RequirementDetail, RequirementStatus, SourceType, SourceView } from '@trainlead/shared/domain';
import { SOURCE_TYPES } from '@trainlead/shared/domain';
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
  protected readonly savingSource = signal(false);
  protected readonly sourceTypes = SOURCE_TYPES;
  protected readonly sourceType = signal<SourceType>('Manual');
  protected readonly sourceGroup = signal('');
  protected readonly sourceText = signal('');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

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
      next: ({ data }) => { this.requirement.set(data); this.successMessage.set(`Requirement is now ${data.status}.`); },
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

  protected addSource(): void {
    this.savingSource.set(true);
    this.api.addSource(this.id, {
      sourceType: this.sourceType(),
      groupName: this.sourceGroup(),
      rawText: this.sourceText(),
      postedAt: null,
    }).pipe(finalize(() => this.savingSource.set(false))).subscribe({
      next: () => { this.sourceGroup.set(''); this.sourceText.set(''); this.load(); },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected updateSourceGroup(source: SourceView, value: string): void {
    this.api.updateSource(source.requirementId, source.id, { groupName: value }).subscribe({
      next: () => this.load(),
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected removeSource(source: SourceView): void {
    if (!globalThis.confirm('Remove this source post? The requirement will remain.')) return;
    this.api.removeSource(source.requirementId, source.id).subscribe({
      next: () => this.load(),
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

  protected ungroup(): void {
    if (!globalThis.confirm('Remove this requirement from its opportunity group? The original vendor posts will remain.')) return;
    this.api.ungroupRequirement(this.id).subscribe({
      next: () => { this.successMessage.set('Requirement removed from the group.'); this.load(); },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected formatDate(value: string | null): string {
    return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : 'Not specified';
  }
}
