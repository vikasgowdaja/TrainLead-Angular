import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TrainerProfileUpdateInput } from '@trainlead/shared';
import type { TrainerCertification, TrainerPortfolioItem, TrainerProfileSuggestions, TrainerProfileView } from '@trainlead/shared/domain';
import { finalize } from 'rxjs';
import { ResumePreview } from '../../resume-preview';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';

function resumeNameFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '') || null;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-trainer-profile',
  imports: [RouterLink, ResumePreview],
  templateUrl: './trainer-profile.html',
})
export class TrainerProfilePage {
  private readonly api = inject(MarketplaceService);
  protected readonly profile = signal<TrainerProfileView | null>(null);
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly location = signal('');
  protected readonly skills = signal('');
  protected readonly expectedRate = signal('');
  protected readonly githubUrl = signal('');
  protected readonly linkedinUrl = signal('');
  protected readonly leetcodeUrl = signal('');
  protected readonly bio = signal('');
  protected readonly portfolioItems = signal<TrainerPortfolioItem[]>([]);
  protected readonly certifications = signal<TrainerCertification[]>([]);
  protected readonly isPublic = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly uploadingPhoto = signal(false);
  protected readonly uploadingResume = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly extractionNotice = signal<string | null>(null);

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
    const location = this.location().trim();
    const rawRate = this.expectedRate().trim();
    const expectedRate = rawRate ? Number(rawRate) : null;
    const skills = [...new Set(this.skills().split(',').map((skill) => skill.trim()).filter(Boolean))];
    const githubUrl = this.githubUrl().trim();
    const linkedinUrl = this.linkedinUrl().trim();
    const leetcodeUrl = this.leetcodeUrl().trim();
    const bio = this.bio().trim();
    const portfolioItems = this.portfolioItems().map((item) => ({
      title: item.title.trim(),
      description: item.description.trim(),
      imageUrl: item.imageUrl?.trim() || null,
      videoUrl: item.videoUrl?.trim() || null,
      projectUrl: item.projectUrl?.trim() || null,
    }));
    const certifications = this.certifications().map((item) => ({
      name: item.name.trim(),
      issuer: item.issuer.trim(),
      issuedDate: item.issuedDate || null,
      credentialUrl: item.credentialUrl.trim(),
    }));
    if (name.length < 2) { this.errorMessage.set('Enter your name.'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.errorMessage.set('Enter a valid email address.'); return; }
    if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) { this.errorMessage.set('Enter 10-15 digits for your phone number.'); return; }
    if (!email && !phone) { this.errorMessage.set('Add an email address or phone number.'); return; }
    if (location.length > 120 || skills.length > 20 || skills.some((skill) => skill.length > 60)) { this.errorMessage.set('Check location length and keep up to 20 skills, with each skill 60 characters or fewer.'); return; }
    if (rawRate && (!Number.isFinite(expectedRate) || expectedRate! < 0)) { this.errorMessage.set('Enter a non-negative daily rate.'); return; }
    if (!this.isValidProfileUrl(githubUrl, 'github.com')) { this.errorMessage.set('Enter a valid HTTPS GitHub profile link.'); return; }
    if (!this.isValidProfileUrl(linkedinUrl, 'linkedin.com')) { this.errorMessage.set('Enter a valid HTTPS LinkedIn profile link.'); return; }
    if (!this.isValidProfileUrl(leetcodeUrl, 'leetcode.com')) { this.errorMessage.set('Enter a valid HTTPS LeetCode profile link.'); return; }
    if (bio.length > 1000) { this.errorMessage.set('Keep your profile summary to 1,000 characters or fewer.'); return; }
    if (portfolioItems.length > 8 || portfolioItems.some((item) => item.title.length === 0 || (!item.imageUrl && !item.videoUrl && !item.projectUrl))) {
      this.errorMessage.set('Each work item needs a title and at least one image, video, or project link. You can add up to 8 items.');
      return;
    }
    if (portfolioItems.some((item) => !this.isValidHttpsUrl(item.imageUrl) || !this.isValidHttpsUrl(item.videoUrl) || !this.isValidHttpsUrl(item.projectUrl))) {
      this.errorMessage.set('Portfolio images, videos, and links must use HTTPS URLs.');
      return;
    }
    if (certifications.length > 20 || certifications.some((item) => item.name.length < 2 || !this.isValidHttpsUrl(item.credentialUrl))) {
      this.errorMessage.set('Each certification needs a name and a valid HTTPS credential link. You can add up to 20.');
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const input: TrainerProfileUpdateInput = {
      name, email: email || null, phone: phone || null, location: location || null, skills,
      expectedRate, githubUrl: githubUrl || null, linkedinUrl: linkedinUrl || null,
      leetcodeUrl: leetcodeUrl || null, bio, portfolioItems, certifications, isPublic: this.isPublic(),
    };
    this.api.updateTrainerProfile(input)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: ({ data }) => { this.setProfile(data); this.successMessage.set('Profile updated.'); },
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
  }

  protected addPortfolioItem(): void {
    if (this.portfolioItems().length >= 8) return;
    this.portfolioItems.update((items) => [...items, { title: '', description: '', imageUrl: null, videoUrl: null, projectUrl: null }]);
  }

  protected removePortfolioItem(index: number): void {
    this.portfolioItems.update((items) => items.filter((_, itemIndex) => itemIndex !== index));
  }

  protected updatePortfolioItem(index: number, field: 'title' | 'description' | 'imageUrl' | 'videoUrl' | 'projectUrl', value: string): void {
    this.portfolioItems.update((items) => items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (field === 'title') return { ...item, title: value };
      if (field === 'description') return { ...item, description: value };
      return { ...item, [field]: value.trim() || null };
    }));
  }

  protected addCertification(): void {
    if (this.certifications().length >= 20) return;
    this.certifications.update((items) => [...items, { name: '', issuer: '', issuedDate: null, credentialUrl: '' }]);
  }

  protected removeCertification(index: number): void {
    this.certifications.update((items) => items.filter((_, itemIndex) => itemIndex !== index));
  }

  protected updateCertification(index: number, field: 'name' | 'issuer' | 'issuedDate' | 'credentialUrl', value: string): void {
    this.certifications.update((items) => items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (field === 'name') return { ...item, name: value };
      if (field === 'issuer') return { ...item, issuer: value };
      if (field === 'issuedDate') return { ...item, issuedDate: value || null };
      return { ...item, credentialUrl: value.trim() };
    }));
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
    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage.set('Choose a source photo that is 10 MB or smaller.');
      return;
    }
    this.uploadingPhoto.set(true);
    this.errorMessage.set(null);
    void this.uploadOptimizedPhoto(file);
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
    this.extractionNotice.set(null);
    this.api.extractTrainerResume(file).subscribe({
      next: ({ data }) => {
        const fields = this.applyResumeSuggestions(data);
        this.extractionNotice.set(fields.length
          ? `Found ${fields.join(', ')}. Review the extracted fields and save your profile.`
          : 'No profile details were recognized. Use a text-based PDF or enter your details manually.');
        this.uploadResumeFile(file, data);
      },
      error: (error: unknown) => {
        this.extractionNotice.set(`Resume extraction failed: ${describeHttpError(error)}. You can enter details manually.`);
        this.uploadResumeFile(file, null);
      },
    });
  }

  private setProfile(profile: TrainerProfileView): void {
    this.profile.set({ ...profile, resumeFileName: profile.resumeFileName || resumeNameFromUrl(profile.resumeUrl) });
    this.name.set(profile.name);
    this.email.set(profile.email ?? '');
    this.phone.set(profile.phone ?? '');
    this.location.set(profile.location);
    this.skills.set(profile.skills.join(', '));
    this.expectedRate.set(profile.expectedRate?.toString() ?? '');
    this.githubUrl.set(profile.githubUrl ?? '');
    this.linkedinUrl.set(profile.linkedinUrl ?? '');
    this.leetcodeUrl.set(profile.leetcodeUrl ?? '');
    this.bio.set(profile.bio ?? '');
    this.portfolioItems.set(profile.portfolioItems ?? []);
    this.certifications.set(profile.certifications ?? []);
    this.isPublic.set(profile.isPublic);
  }

  private isValidProfileUrl(value: string, host: string): boolean {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && (url.hostname === host || url.hostname === `www.${host}`);
    } catch {
      return false;
    }
  }

  private isValidHttpsUrl(value: string | null): boolean {
    if (!value) return true;
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  }

  private applyResumeSuggestions(suggestions: TrainerProfileSuggestions): string[] {
    const fields: string[] = [];
    if (suggestions.name) { this.name.set(suggestions.name); fields.push('name'); }
    if (suggestions.email) { this.email.set(suggestions.email); fields.push('email'); }
    if (suggestions.phone) { this.phone.set(suggestions.phone); fields.push('phone'); }
    if (suggestions.location) { this.location.set(suggestions.location); fields.push('location'); }
    if (suggestions.skills.length) { this.skills.set(suggestions.skills.join(', ')); fields.push('skills'); }
    if (suggestions.githubUrl) { this.githubUrl.set(suggestions.githubUrl); fields.push('GitHub'); }
    if (suggestions.linkedinUrl) { this.linkedinUrl.set(suggestions.linkedinUrl); fields.push('LinkedIn'); }
    if (suggestions.leetcodeUrl) { this.leetcodeUrl.set(suggestions.leetcodeUrl); fields.push('LeetCode'); }
    return fields;
  }

  private uploadResumeFile(file: File, suggestions: TrainerProfileSuggestions | null): void {
    this.api.uploadTrainerResume(file).pipe(finalize(() => this.uploadingResume.set(false))).subscribe({
      next: ({ data }) => {
        this.setProfile(data);
        if (suggestions) this.applyResumeSuggestions(suggestions);
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  private async uploadOptimizedPhoto(file: File): Promise<void> {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare this photo. Try another image.');
      const side = Math.min(bitmap.width, bitmap.height);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not compress this photo. Try another image.')), 'image/jpeg', 0.82);
      });
      if (blob.size > 1024 * 1024) throw new Error('Optimized photo is still too large. Choose a simpler image.');
      const optimized = new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
      this.api.uploadTrainerPhoto(optimized).pipe(finalize(() => this.uploadingPhoto.set(false))).subscribe({
        next: ({ data }) => { this.setProfile(data); this.successMessage.set('Profile photo uploaded.'); },
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
    } catch (error) {
      this.uploadingPhoto.set(false);
      this.errorMessage.set(error instanceof Error ? error.message : 'Could not prepare this photo. Try another image.');
    }
  }
}