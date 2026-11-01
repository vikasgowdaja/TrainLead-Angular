import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DELIVERY_MODES, SUPPORT_STATUSES, type RequirementDetail } from '@trainlead/shared/domain';
import type { RequirementInput } from '@trainlead/shared';
import { finalize } from 'rxjs';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';

function dateOrder(control: AbstractControl): ValidationErrors | null {
  const start = control.get('startDate')?.value as string | undefined;
  const end = control.get('endDate')?.value as string | undefined;
  return start && end && end < start ? { dateOrder: true } : null;
}

@Component({
  selector: 'app-requirement-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './requirement-form.html',
})
export class RequirementFormPage {
  private readonly api = inject(MarketplaceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  protected readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly modes = DELIVERY_MODES;
  protected readonly supportStatuses = SUPPORT_STATUSES;
  protected readonly loading = signal(Boolean(this.id));
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly existing = signal<RequirementDetail | null>(null);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(3), Validators.maxLength(140)]),
    description: this.fb.nonNullable.control(''),
    domain: this.fb.nonNullable.control(''),
    skills: this.fb.nonNullable.control('', Validators.required),
    city: this.fb.nonNullable.control('', Validators.required),
    state: this.fb.nonNullable.control(''),
    mode: this.fb.nonNullable.control<(typeof DELIVERY_MODES)[number]>('Offline'),
    startDate: this.fb.nonNullable.control('', Validators.required),
    endDate: this.fb.nonNullable.control('', Validators.required),
    durationDays: this.fb.nonNullable.control(1, [Validators.required, Validators.min(1)]),
    audience: this.fb.nonNullable.control('', Validators.required),
    studentCount: this.fb.control<number | null>(null, Validators.min(1)),
    experienceRequired: this.fb.nonNullable.control(''),
    budgetMin: this.fb.control<number | null>(null, Validators.min(0)),
    budgetMax: this.fb.control<number | null>(null, Validators.min(0)),
    paymentTerms: this.fb.nonNullable.control(''),
    paymentDueDate: this.fb.nonNullable.control(''),
    travel: this.fb.nonNullable.control<(typeof SUPPORT_STATUSES)[number]>('Unknown'),
    food: this.fb.nonNullable.control<(typeof SUPPORT_STATUSES)[number]>('Unknown'),
    stay: this.fb.nonNullable.control<(typeof SUPPORT_STATUSES)[number]>('Unknown'),
  }, { validators: dateOrder });

  constructor() {
    if (this.id) {
      this.api.getRequirement(this.id).pipe(finalize(() => this.loading.set(false))).subscribe({
        next: ({ data }) => {
          this.existing.set(data);
          this.form.patchValue({
            title: data.title, description: data.description, domain: data.domain, skills: data.skills.join(', '),
            city: data.city, state: data.state, mode: data.mode, startDate: data.startDate, endDate: data.endDate,
            durationDays: data.durationDays, audience: data.audience, studentCount: data.studentCount,
            experienceRequired: data.experienceRequired, budgetMin: data.budgetMin, budgetMax: data.budgetMax,
            paymentTerms: data.paymentTerms ?? '', paymentDueDate: data.paymentDueDate ?? '',
            travel: data.travel, food: data.food, stay: data.stay,
          });
        },
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
    }
  }

  protected save(publish: boolean): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.existing() && !this.existing()!.canManage) {
      this.errorMessage.set('Only the posting organization can edit this requirement.');
      return;
    }
    const value = this.form.getRawValue();
    const requirement: RequirementInput = {
      ...value,
      skills: [...new Set(value.skills.split(',').map((skill) => skill.trim()).filter(Boolean))],
      studentCount: value.studentCount || null,
      budgetMin: value.budgetMin,
      budgetMax: value.budgetMax,
      paymentTerms: value.paymentTerms.trim() || null,
      paymentDueDate: value.paymentDueDate || null,
    };
    this.errorMessage.set(null);
    this.saving.set(true);
    const request = this.id
      ? this.api.updateRequirement(this.id, requirement)
      : this.api.createRequirement({ requirement, publish });
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: ({ data }) => {
        if (this.id && publish && data.status === 'Draft') {
          this.api.changeStatus(data.id, 'Open').subscribe({
            next: () => void this.router.navigate(['/requirements', data.id]),
            error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
          });
          return;
        }
        void this.router.navigate(['/requirements', data.id]);
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }
}
