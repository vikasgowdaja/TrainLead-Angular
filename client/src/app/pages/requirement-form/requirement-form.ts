import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DELIVERY_MODES, SUPPORT_STATUSES, type RequirementDetail, type RequirementStatus } from '@trainlead/shared/domain';
import type { RequirementInput, SourceInput } from '@trainlead/shared';
import type { ExtractionConfidence, SmartExtractionResult } from '@trainlead/shared/domain';
import { EMPTY, catchError, combineLatest, finalize, of, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';

function dateOrder(control: AbstractControl): ValidationErrors | null {
  const start = control.get('startDate')?.value as string | undefined;
  const end = control.get('endDate')?.value as string | undefined;
  return start && end && end < start ? { dateOrder: true } : null;
}

export function calculateInclusiveDuration(startDate: string, endDate: string): number | null {
  if (!startDate || !endDate || endDate < startDate) return null;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.floor((end - start) / 86_400_000) + 1;
}

@Component({
  selector: 'app-requirement-form',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe],
  templateUrl: './requirement-form.html',
})
export class RequirementFormPage {
  private readonly api = inject(MarketplaceService);
  private readonly auth = inject(AuthService);
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
  protected readonly editorMode = signal<'manual' | 'smart'>('manual');
  protected readonly smartInputMode = signal<'text' | 'image' | 'table'>('text');
  protected readonly smartInput = signal('');
  protected readonly smartImage = signal<File | null>(null);
  protected readonly smartImagePreview = signal<string | null>(null);
  protected readonly extraction = signal<SmartExtractionResult | null>(null);
  protected readonly extracting = signal(false);
  protected readonly extractionError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(3), Validators.maxLength(140)]),
    status: this.fb.nonNullable.control<RequirementStatus>('Draft'),
    description: this.fb.nonNullable.control(''),
    domain: this.fb.nonNullable.control(''),
    skills: this.fb.nonNullable.control('', Validators.required),
    city: this.fb.nonNullable.control('', Validators.required),
    state: this.fb.nonNullable.control(''),
    mode: this.fb.nonNullable.control<(typeof DELIVERY_MODES)[number] | ''>('Offline', Validators.required),
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
    combineLatest([
      this.form.controls.startDate.valueChanges.pipe(startWith(this.form.controls.startDate.value)),
      this.form.controls.endDate.valueChanges.pipe(startWith(this.form.controls.endDate.value)),
    ]).pipe(takeUntilDestroyed()).subscribe(([startDate, endDate]) => {
      const durationDays = calculateInclusiveDuration(startDate, endDate);
      if (durationDays !== null) {
        this.form.controls.durationDays.setValue(durationDays, { emitEvent: false });
      }
    });

    if (this.id) {
      this.api.getRequirement(this.id).pipe(finalize(() => this.loading.set(false))).subscribe({
        next: ({ data }) => {
          this.existing.set(data);
          this.form.patchValue({
            title: data.title, description: data.description, domain: data.domain, skills: data.skills.join(', '),
            status: data.status,
            city: data.city, state: data.state, mode: data.mode, startDate: data.startDate, endDate: data.endDate,
            durationDays: data.durationDays, audience: data.audience, studentCount: data.studentCount,
            experienceRequired: data.experienceRequired, budgetMin: data.budgetMin, budgetMax: data.budgetMax,
            paymentTerms: data.paymentTerms ?? '', paymentDueDate: data.paymentDueDate ?? '',
            travel: data.travel, food: data.food, stay: data.stay,
          });
        },
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
    } else if (this.auth.hasRole('Vendor')) {
      this.loading.set(true);
      this.api.getMyOrganization().pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 409) {
            void this.router.navigateByUrl('/organization/new');
            return EMPTY;
          }
          this.errorMessage.set(describeHttpError(error));
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      ).subscribe();
    }
  }

  protected setEditorMode(mode: 'manual' | 'smart'): void {
    this.editorMode.set(mode);
    if (mode === 'smart' && !this.extraction()) this.smartInputMode.set('text');
  }

  protected availableStatuses(): RequirementStatus[] {
    const requirement = this.existing();
    return requirement ? [requirement.status, ...requirement.allowedStatuses.filter((status) => status !== requirement.status)] : [];
  }

  protected setSmartInputMode(mode: 'text' | 'image' | 'table'): void {
    this.smartInputMode.set(mode);
    this.extraction.set(null);
    this.extractionError.set(null);
  }

  protected onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setImage(input.files?.[0] ?? null);
    input.value = '';
  }

  protected onImageDrop(event: DragEvent): void {
    event.preventDefault();
    this.setImage(event.dataTransfer?.files[0] ?? null);
  }

  protected allowImageDrop(event: DragEvent): void {
    event.preventDefault();
  }

  protected clearImage(): void {
    const preview = this.smartImagePreview();
    if (preview) URL.revokeObjectURL(preview);
    this.smartImage.set(null);
    this.smartImagePreview.set(null);
    this.extraction.set(null);
  }

  protected extractSmartImport(): void {
    if (this.extracting()) return;
    this.extractionError.set(null);
    const request = this.smartInputMode() === 'image'
      ? this.imageExtractionRequest()
      : this.textExtractionRequest();
    if (!request) return;

    this.extracting.set(true);
    request.pipe(finalize(() => this.extracting.set(false))).subscribe({
      next: ({ data }) => {
        this.extraction.set(data);
        this.applyExtraction(data);
      },
      error: (error: unknown) => this.extractionError.set(describeHttpError(error)),
    });
  }

  protected estimatedTotalLabel(): string | null {
    const amount = this.extraction()?.estimatedTotalBudget;
    return amount === null || amount === undefined
      ? null
      : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  }

  protected extractedFieldCount(result: SmartExtractionResult): number {
    return Object.keys(result.extracted).length;
  }

  protected confidenceEntries(result: SmartExtractionResult): { field: string; level: ExtractionConfidence }[] {
    return Object.entries(result.confidence).map(([field, level]) => ({ field, level }));
  }

  private textExtractionRequest() {
    const input = this.smartInput().trim();
    if (!input) {
      this.extractionError.set(this.smartInputMode() === 'table' ? 'Paste a CSV or tab-separated row first.' : 'Paste requirement details first.');
      return null;
    }
    return this.api.extractRequirement({ input, inputType: this.smartInputMode() === 'table' ? 'table' : 'text' });
  }

  private imageExtractionRequest() {
    const file = this.smartImage();
    if (!file) {
      this.extractionError.set('Choose a PNG, JPG, or WebP screenshot first.');
      return null;
    }
    return this.api.extractRequirementImage(file);
  }

  private setImage(file: File | null): void {
    this.extractionError.set(null);
    this.extraction.set(null);
    const previousPreview = this.smartImagePreview();
    if (previousPreview) URL.revokeObjectURL(previousPreview);
    if (!file) {
      this.smartImage.set(null);
      this.smartImagePreview.set(null);
      return;
    }
    const supportedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!supportedTypes.includes(file.type)) {
      this.smartImage.set(null);
      this.smartImagePreview.set(null);
      this.extractionError.set('Unsupported file. Choose a PNG, JPG, or WebP image; PDF is not supported.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.smartImage.set(null);
      this.smartImagePreview.set(null);
      this.extractionError.set('Image must be 5 MB or smaller.');
      return;
    }
    this.smartImage.set(file);
    this.smartImagePreview.set(URL.createObjectURL(file));
  }

  private applyExtraction(result: SmartExtractionResult): void {
    const fields = result.extracted;
    this.form.patchValue({
      title: fields.title ?? '',
      description: fields.description ?? '',
      domain: fields.domain ?? '',
      skills: fields.skills?.join(', ') ?? '',
      city: fields.city ?? '',
      state: fields.state ?? '',
      mode: fields.mode ?? 'Offline',
      startDate: fields.startDate ?? '',
      endDate: fields.endDate ?? '',
      durationDays: fields.durationDays ?? 1,
      audience: fields.audience ?? '',
      studentCount: fields.studentCount ?? null,
      experienceRequired: fields.experienceRequired ?? '',
      budgetMin: fields.budgetMin ?? null,
      budgetMax: fields.budgetMax ?? null,
      paymentTerms: fields.paymentTerms ?? '',
      paymentDueDate: fields.paymentDueDate ?? '',
      travel: fields.travel ?? 'Unknown',
      food: fields.food ?? 'Unknown',
      stay: fields.stay ?? 'Unknown',
    });
    this.editorMode.set('smart');
  }

  protected save(publish: boolean): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      const invalidFields = this.invalidFieldLabels();
      this.errorMessage.set(`Cannot ${publish ? 'publish' : 'save draft'} yet. Check: ${invalidFields.join(', ')}.`);
      return;
    }
    if (this.existing() && !this.existing()!.canManage) {
      this.errorMessage.set('Only the posting organization can edit this requirement.');
      return;
    }
    const { status, ...value } = this.form.getRawValue();
    const requirement: RequirementInput = {
      ...value,
      mode: value.mode as (typeof DELIVERY_MODES)[number],
      skills: [...new Set(value.skills.split(',').map((skill) => skill.trim()).filter(Boolean))],
      studentCount: value.studentCount || null,
      budgetMin: value.budgetMin,
      budgetMax: value.budgetMax,
      paymentTerms: value.paymentTerms.trim() || null,
      paymentDueDate: value.paymentDueDate || null,
    };
    this.errorMessage.set(null);
    this.saving.set(true);
    const extraction = this.extraction();
    const source: SourceInput | undefined = extraction
      ? { sourceType: 'Import', groupName: '', rawText: extraction.extractedText.slice(0, 20_000), postedAt: null }
      : undefined;
    const request = this.id
      ? this.api.updateRequirement(this.id, requirement).pipe(
        switchMap(({ data }) => status === data.status ? of({ data }) : this.api.changeStatus(data.id, status)),
      )
      : this.api.createRequirement({ requirement, publish, ...(source ? { source } : {}) });
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: ({ data }) => {
        void this.router.navigate(['/requirements', data.id]);
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  private invalidFieldLabels(): string[] {
    const labels: Record<string, string> = {
      title: 'Title', skills: 'Required skills', city: 'City', mode: 'Delivery mode',
      startDate: 'Start date', endDate: 'End date', durationDays: 'Duration', audience: 'Target audience',
      studentCount: 'Number of students', budgetMin: 'Budget minimum', budgetMax: 'Budget maximum',
    };
    const invalid = Object.entries(this.form.controls)
      .filter(([, control]) => control.invalid)
      .map(([name]) => labels[name] ?? name);
    if (this.form.hasError('dateOrder')) invalid.push('End date must be on or after start date');
    return [...new Set(invalid)];
  }
}
