import { Component, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { STATUS_TRANSITIONS, type RequirementStatus } from '@trainlead/shared/domain';
import { finalize } from 'rxjs';
import { describeHttpError } from '../core/http-error';
import { MarketplaceService } from '../core/marketplace.service';
import { Requirement } from '../requirement.model';
import { ClickOutsideDirective } from '../click-outside.directive';

@Component({
  selector: 'app-requirement-card',
  imports: [ClickOutsideDirective, RouterLink],
  styleUrl: './requirement-card.scss',
  templateUrl: './requirement-card.html',
})
export class RequirementCard {
  readonly requirement = input.required<Requirement>();
  readonly requirementChanged = output<void>();
  protected readonly saving = signal(false);
  protected readonly actionError = signal<string | null>(null);
  private readonly api = inject(MarketplaceService);
  private readonly router = inject(Router);

  protected availableStatuses(): readonly RequirementStatus[] {
    return STATUS_TRANSITIONS[this.requirement().status];
  }

  protected changeStatus(status: RequirementStatus): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.actionError.set(null);
    this.api.changeStatus(this.requirement().id, status).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => this.requirementChanged.emit(),
      error: (error: unknown) => this.actionError.set(describeHttpError(error)),
    });
  }

  protected duplicate(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.actionError.set(null);
    this.api.duplicateRequirement(this.requirement().id).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: ({ data }) => void this.router.navigate(['/requirements', data.id]),
      error: (error: unknown) => this.actionError.set(describeHttpError(error)),
    });
  }

  protected remove(): void {
    if (this.saving() || !globalThis.confirm('Delete this requirement? This hides it from the marketplace but retains source history.')) return;
    this.saving.set(true);
    this.actionError.set(null);
    this.api.deleteRequirement(this.requirement().id).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => this.requirementChanged.emit(),
      error: (error: unknown) => this.actionError.set(describeHttpError(error)),
    });
  }
}