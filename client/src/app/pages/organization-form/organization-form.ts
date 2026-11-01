import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ORGANIZATION_TYPES } from '@trainlead/shared/domain';
import type { OrganizationInput } from '@trainlead/shared';
import { finalize } from 'rxjs';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';

@Component({
  selector: 'app-organization-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './organization-form.html',
})
export class OrganizationFormPage {
  private readonly api = inject(MarketplaceService);
  private readonly router = inject(Router);
  protected readonly types = ORGANIZATION_TYPES;
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    legalName: ['', [Validators.required, Validators.minLength(2)]],
    brandName: [''],
    type: ['Training company' as (typeof ORGANIZATION_TYPES)[number]],
    city: ['', Validators.required],
    state: ['', Validators.required],
    website: [''],
    primaryContactName: ['', Validators.required],
    email: ['', Validators.email],
    phone: ['', Validators.pattern(/^\+?[0-9]{10,15}$/)],
    gstin: [''],
    pan: [''],
  });

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const input: OrganizationInput = {
      ...value,
      website: value.website.trim() || null,
      email: value.email.trim() || null,
      phone: value.phone.trim() || null,
      gstin: value.gstin.trim() || null,
      pan: value.pan.trim() || null,
    };
    this.errorMessage.set(null);
    this.saving.set(true);
    this.api.createOrganization(input).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }
}
