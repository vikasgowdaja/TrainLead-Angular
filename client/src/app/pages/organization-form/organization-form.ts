import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ORGANIZATION_TYPES, type OrganizationMemberView, type OrganizationView } from '@trainlead/shared/domain';
import type { OrganizationInput } from '@trainlead/shared';
import { finalize } from 'rxjs';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-organization-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './organization-form.html',
})
export class OrganizationFormPage {
  private readonly api = inject(MarketplaceService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly isEditing = inject(Router).routerState.snapshot.root.firstChild?.routeConfig?.path === 'organization';
  protected readonly loading = signal(this.isEditing);
  protected readonly types = ORGANIZATION_TYPES;
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly memberErrorMessage = signal<string | null>(null);
  protected readonly existing = signal<OrganizationView | null>(null);
  protected readonly members = signal<OrganizationMemberView[]>([]);
  protected readonly memberIdentifier = signal('');
  protected readonly memberRole = signal<'owner' | 'recruiter'>('recruiter');
  protected readonly canManageMembers = computed(() => this.existing()?.myRole === 'owner');
  protected readonly otpCode = signal('');
  protected readonly otpSent = signal(false);
  protected readonly sendingOtp = signal(false);
  protected readonly verifyingOtp = signal(false);

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

  constructor() {
    if (this.isEditing) {
      this.api.getMyOrganization().pipe(finalize(() => this.loading.set(false))).subscribe({
        next: ({ data }) => {
          this.existing.set(data);
          this.form.patchValue({
            legalName: data.legalName, brandName: data.brandName, type: data.type,
            city: data.city, state: data.state, website: data.website ?? '',
            primaryContactName: data.primaryContactName, email: data.email ?? '', phone: data.phone ?? '',
            gstin: data.gstin ?? '', pan: data.pan ?? '',
          });
          this.loadMembers();
        },
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
    }
  }

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
    this.successMessage.set(null);
    this.saving.set(true);
    const request = this.isEditing ? this.api.updateOrganization(input) : this.api.createOrganization(input);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: ({ data }) => {
        this.existing.set(data);
        if (this.isEditing) this.successMessage.set('Organization details saved.');
        else void this.router.navigateByUrl('/');
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected submitVerification(): void {
    this.api.updateOrganizationVerification('Pending', this.existing()?.verificationNote ?? null).subscribe({
      next: ({ data }) => { this.existing.set(data); this.successMessage.set('Verification information submitted.'); },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected sendEmailOtp(): void {
    this.errorMessage.set(null);
    this.sendingOtp.set(true);
    this.api.sendOrganizationEmailOtp().pipe(finalize(() => this.sendingOtp.set(false))).subscribe({
      next: ({ data }) => {
        this.otpSent.set(true);
        this.successMessage.set(`Verification code sent. It expires in ${Math.round(data.expiresInSeconds / 60)} minutes.`);
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected verifyEmailOtp(): void {
    const code = this.otpCode().trim();
    if (!/^\d{6}$/.test(code) || this.verifyingOtp()) return;
    this.errorMessage.set(null);
    this.verifyingOtp.set(true);
    this.api.verifyOrganizationEmailOtp(code).pipe(finalize(() => this.verifyingOtp.set(false))).subscribe({
      next: ({ data }) => {
        this.existing.set(data);
        this.otpCode.set('');
        this.otpSent.set(false);
        this.successMessage.set('Organization email verified.');
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected canVerifyEmailOtp(): boolean {
    return /^\d{6}$/.test(this.otpCode().trim()) && !this.verifyingOtp();
  }

  protected addMember(): void {
    const identifier = this.memberIdentifier().trim();
    if (!this.canAddMember()) {
      this.memberErrorMessage.set('Enter the registered email or 10-15 digit phone for an existing Vendor account.');
      return;
    }
    const alreadyMember = this.members().find((member) =>
      member.email?.toLowerCase() === identifier.toLowerCase() || member.phone === identifier,
    );
    if (alreadyMember) {
      this.memberErrorMessage.set(`${alreadyMember.name} is already an organization ${alreadyMember.orgRole}.`);
      return;
    }
    this.memberErrorMessage.set(null);
    this.api.addOrganizationMember(identifier, this.memberRole()).subscribe({
      next: ({ data }) => {
        this.members.update((members) => [...members.filter((member) => member.userId !== data.userId), data]);
        this.memberIdentifier.set('');
        this.successMessage.set('Organization member added.');
      },
      error: (error: unknown) => this.memberErrorMessage.set(describeHttpError(error)),
    });
  }

  protected canAddMember(): boolean {
    const value = this.memberIdentifier().trim();
    return value.includes('@')
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      : /^\+?[0-9]{10,15}$/.test(value);
  }

  protected changeMemberRole(member: OrganizationMemberView, role: 'owner' | 'recruiter'): void {
    this.api.updateOrganizationMember(member.userId, role).subscribe({
      next: ({ data }) => this.members.update((members) => members.map((item) => item.userId === data.userId ? data : item)),
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected removeMember(member: OrganizationMemberView): void {
    if (!globalThis.confirm(`Remove ${member.name} from this organization?`)) return;
    this.api.removeOrganizationMember(member.userId).subscribe({
      next: () => {
        this.members.update((members) => members.filter((item) => item.userId !== member.userId));
        this.successMessage.set('Organization member removed.');
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  private loadMembers(): void {
    this.api.listOrganizationMembers().subscribe({
      next: ({ data }) => this.members.set(data),
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }
}
