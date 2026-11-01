import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TrainerProfileView } from '@trainlead/shared/domain';
import { finalize } from 'rxjs';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';

@Component({
  selector: 'app-trainer-profile',
  imports: [RouterLink],
  templateUrl: './trainer-profile.html',
})
export class TrainerProfilePage {
  private readonly api = inject(MarketplaceService);
  protected readonly profile = signal<TrainerProfileView | null>(null);
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly uploadingPhoto = signal(false);
  protected readonly uploadingResume = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.getTrainerProfile().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ data }) => this.setProfile(data),
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected save(): void {
    if (this.saving()) return;
    const name = this.name().trim();
    const email = this.email().trim().toLowerCase();
    const phone = this.phone().trim();
    if (name.length < 2) { this.errorMessage.set('Enter your name.'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.errorMessage.set('Enter a valid email address.'); return; }
    if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) { this.errorMessage.set('Enter 10-15 digits for your phone number.'); return; }
    if (!email && !phone) { this.errorMessage.set('Add an email address or phone number.'); return; }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api.updateTrainerProfile({ name, email: email || null, phone: phone || null })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: ({ data }) => { this.setProfile(data); this.successMessage.set('Profile updated.'); },
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
  }

  protected onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.errorMessage.set('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 1024 * 1024) {
      this.errorMessage.set('Profile photo must be 1 MB or smaller.');
      return;
    }
    this.uploadingPhoto.set(true);
    this.errorMessage.set(null);
    this.api.uploadTrainerPhoto(file).pipe(finalize(() => this.uploadingPhoto.set(false))).subscribe({
      next: ({ data }) => { this.setProfile(data); this.successMessage.set('Profile photo uploaded.'); },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected onResumeSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      this.errorMessage.set('Choose a PDF resume.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      this.errorMessage.set('Resume must be 3 MB or smaller.');
      return;
    }
    this.uploadingResume.set(true);
    this.errorMessage.set(null);
    this.api.uploadTrainerResume(file).pipe(finalize(() => this.uploadingResume.set(false))).subscribe({
      next: ({ data }) => { this.setProfile(data); this.successMessage.set('Resume uploaded.'); },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  private setProfile(profile: TrainerProfileView): void {
    this.profile.set(profile);
    this.name.set(profile.name);
    this.email.set(profile.email ?? '');
    this.phone.set(profile.phone ?? '');
  }
}