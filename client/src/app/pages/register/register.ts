import { Component, inject, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { RegisterInput, Role } from '@trainlead/shared';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { describeHttpError } from '../../core/http-error';

type SelfServiceRole = Exclude<Role, 'Admin'>;

function emailOrPhoneRequired(group: AbstractControl): ValidationErrors | null {
  const { email, phone } = group.value as { email: string; phone: string };
  return email.trim() || phone.trim() ? null : { emailOrPhone: true };
}

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly roles: { value: SelfServiceRole; label: string; hint: string }[] = [
    { value: 'Trainer', label: 'Trainer', hint: 'Find and apply to trainings' },
    { value: 'Vendor', label: 'Vendor', hint: 'Post training requirements' },
    { value: 'Viewer', label: 'Viewer', hint: 'Browse only' },
  ];

  protected readonly form = this.fb.group(
    {
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      email: ['', Validators.email],
      phone: ['', Validators.pattern(/^\+?[0-9]{10,15}$/)],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      role: this.fb.control<SelfServiceRole>('Trainer'),
    },
    { validators: emailOrPhoneRequired },
  );
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected showError(name: 'name' | 'email' | 'phone' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected showContactError(): boolean {
    return this.form.hasError('emailOrPhone') && this.form.controls.email.touched && this.form.controls.phone.touched;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, email, phone, password, role } = this.form.getRawValue();
    const input: RegisterInput = {
      name,
      password,
      role,
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    };

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.auth
      .register(input)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl(this.auth.currentUser()?.role === 'Vendor' ? '/organization/new' : '/'),
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
  }
}
