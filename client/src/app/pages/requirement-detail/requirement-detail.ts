import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { DemoSlotInput } from '@trainlead/shared';
import type { ApplicationStatus, ApplicationView, DemoSlotView, RequirementDetail, RequirementStatus, SourceType, SourceView, TrainerProfileView } from '@trainlead/shared/domain';
import { SOURCE_TYPES } from '@trainlead/shared/domain';
import { finalize } from 'rxjs';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';
import { AuthService } from '../../core/auth/auth.service';
import { ResumePreview } from '../../resume-preview';

@Component({
  selector: 'app-requirement-detail',
  imports: [CurrencyPipe, DatePipe, RouterLink, ResumePreview],
  templateUrl: './requirement-detail.html',
})
export class RequirementDetailPage {
  private readonly api = inject(MarketplaceService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly id = this.route.snapshot.paramMap.get('id')!;
  protected readonly notificationTarget = this.route.snapshot.fragment;
  protected readonly requirement = signal<RequirementDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly savingSource = signal(false);
  protected readonly sourceTypes = SOURCE_TYPES;
  protected readonly sourceType = signal<SourceType>('Manual');
  protected readonly sourceGroup = signal('');
  protected readonly sourceText = signal('');
  protected readonly loadError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly myApplication = signal<ApplicationView | null>(null);
  protected readonly myApplicationLoaded = signal(false);
  protected readonly trainerProfileLoaded = signal(false);
  private readonly trainerProfile = signal<TrainerProfileView | null>(null);
  protected readonly reapplying = signal(false);
  private readonly previousApplication = signal<ApplicationView | null>(null);
  protected readonly applications = signal<ApplicationView[]>([]);
  protected readonly coverNote = signal('');
  protected readonly expectedRate = signal('');
  protected readonly skillsInput = signal('');
  protected readonly locationInput = signal('');
  protected readonly contactPhoneInput = signal(this.auth.currentUser()?.phone ?? '');
  protected readonly resumeUrl = signal('');
  private readonly savedResumeUrl = signal('');
  protected readonly savedResumeFileName = signal<string | null>(null);
  protected readonly githubUrl = signal('');
  protected readonly linkedinUrl = signal('');
  protected readonly leetcodeUrl = signal('');
  protected readonly applying = signal(false);
  protected readonly uploadingResume = signal(false);
  protected readonly applicationBusy = signal<string | null>(null);
  protected readonly applicationFeedbackNotes = signal<Record<string, string>>({});
  protected readonly trainerRatingDrafts = signal<Record<string, number>>({});
  protected readonly trainerReviewDrafts = signal<Record<string, string>>({});
  protected readonly ratingBusy = signal<string | null>(null);
  protected readonly demoProvider = signal<'Google Meet' | 'Zoom' | 'Microsoft Teams'>('Google Meet');
  protected readonly demoMeetingUrl = signal('');
  protected readonly demoSlotDate = signal('');
  protected readonly demoSlotStartTime = signal('16:00');
  protected readonly demoSlotEndTime = signal('18:30');
  protected readonly demoSlotInterval = signal(30);
  protected readonly demoSlotError = signal<string | null>(null);
  protected readonly selectedDemoSlot = signal('');
  protected readonly savingDemoSlots = signal(false);

  constructor() {
    effect((onCleanup) => {
      const message = this.successMessage();
      if (!message) return;
      const timeout = window.setTimeout(() => {
        if (this.successMessage() === message) this.successMessage.set(null);
      }, 5000);
      onCleanup(() => window.clearTimeout(timeout));
    });
    effect((onCleanup) => {
      const message = this.errorMessage();
      if (!message) return;
      const timeout = window.setTimeout(() => {
        if (this.errorMessage() === message) this.errorMessage.set(null);
      }, 8000);
      onCleanup(() => window.clearTimeout(timeout));
    });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.errorMessage.set(null);
    this.api.getRequirement(this.id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ data }) => {
        this.requirement.set(data);
        const firstSlot = data.demoSlots[0];
        if (firstSlot?.meetingUrl && !this.demoMeetingUrl()) {
          this.demoProvider.set(firstSlot.provider);
          this.demoMeetingUrl.set(firstSlot.meetingUrl);
        }
        if (!this.selectedDemoSlot()) this.selectedDemoSlot.set(data.demoSlots.find((slot) => slot.available)?.scheduledAt ?? '');
        if (data.canManage) this.loadApplications();
        else if (this.auth.hasRole('Trainer')) {
          this.loadTrainerProfile();
          this.loadMyApplication();
        }
      },
      error: (error: unknown) => this.loadError.set(describeHttpError(error)),
    });
  }

  protected isTrainer(): boolean {
    return this.auth.hasRole('Trainer');
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
      next: ({ data }) => {
        const resumeUrl = data.resumeUrl?.trim() ?? '';
        this.savedResumeUrl.set(resumeUrl);
        this.savedResumeFileName.set(data.resumeFileName ?? file.name);
        this.resumeUrl.set(resumeUrl);
        this.successMessage.set('Resume uploaded. Its link is ready for your application.');
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected apply(): void {
    if (this.applying()) return;
    if (![this.resumeUrl(), this.githubUrl(), this.linkedinUrl(), this.leetcodeUrl()].every((value) => value.trim())) {
      this.errorMessage.set('Add your resume, GitHub, LinkedIn, and LeetCode links before applying.');
      return;
    }
    const rawRate = this.expectedRate().trim();
    const expectedRate = rawRate ? Number(rawRate) : null;
    if (rawRate && (!Number.isFinite(expectedRate) || expectedRate! < 0)) {
      this.errorMessage.set('Enter a valid non-negative expected rate.');
      return;
    }
    const skills = [...new Set(this.skillsInput().split(',').map((skill) => skill.trim()).filter(Boolean))];
    if (!skills.length) {
      this.errorMessage.set('Add at least one relevant skill before applying.');
      return;
    }
    const location = this.locationInput().trim();
    if (location.length < 2) {
      this.errorMessage.set('Add your city or current location before applying.');
      return;
    }
    const contactPhone = this.contactPhoneInput().trim();
    if (!/^\+?[0-9]{10,15}$/.test(contactPhone)) {
      this.errorMessage.set('Enter a mobile or WhatsApp number with 10-15 digits.');
      return;
    }
    this.applicationBusy.set(null);
    this.applying.set(true);
    this.api.applyToRequirement(this.id, {
      coverNote: this.coverNote().trim(), expectedRate,
      skills,
      location,
      contactPhone,
      resumeUrl: this.resumeUrl().trim(), githubUrl: this.githubUrl().trim(),
      linkedinUrl: this.linkedinUrl().trim(), leetcodeUrl: this.leetcodeUrl().trim(),
    }).pipe(finalize(() => this.applying.set(false))).subscribe({
      next: ({ data }) => {
        const wasReapplying = this.reapplying();
        this.myApplication.set(data);
        this.previousApplication.set(null);
        this.reapplying.set(false);
        this.successMessage.set(wasReapplying ? 'Your updated application was sent to the Vendor.' : 'Application sent to the Vendor.');
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected startReapplication(application: ApplicationView): void {
    const profile = this.trainerProfile();
    this.previousApplication.set(application);
    this.coverNote.set(application.coverNote);
    this.expectedRate.set((profile?.expectedRate ?? application.expectedRate)?.toString() ?? '');
    this.skillsInput.set(profile?.skills.length ? profile.skills.join(', ') : application.trainer.skills.join(', '));
    this.locationInput.set(profile?.location || application.trainer.location);
    this.contactPhoneInput.set(profile?.phone || application.trainer.phone || this.auth.currentUser()?.phone || '');
    this.resumeUrl.set(this.savedResumeUrl() || application.trainer.profileLinks.resume.trim());
    this.githubUrl.set(profile?.githubUrl || application.trainer.profileLinks.github);
    this.linkedinUrl.set(profile?.linkedinUrl || application.trainer.profileLinks.linkedin);
    this.leetcodeUrl.set(profile?.leetcodeUrl || application.trainer.profileLinks.leetcode);
    this.reapplying.set(true);
    this.myApplication.set(null);
  }

  protected cancelReapplication(): void {
    const previous = this.previousApplication();
    if (previous) this.myApplication.set(previous);
    this.previousApplication.set(null);
    this.reapplying.set(false);
  }

  protected addDemoSlots(): void {
    const item = this.requirement();
    const date = this.demoSlotDate();
    const startTime = this.demoSlotStartTime();
    const endTime = this.demoSlotEndTime();
    const meetingUrl = this.demoMeetingUrl().trim();
    const interval = this.demoSlotInterval();
    this.demoSlotError.set(null);
    if (!date) {
      this.demoSlotError.set('Choose a date for these demo slots.');
      return;
    }
    if (!startTime || !endTime) {
      this.demoSlotError.set('Set both a start time and an end time.');
      return;
    }
    const startAt = new Date(`${date}T${startTime}`).getTime();
    const endAt = new Date(`${date}T${endTime}`).getTime();
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
      this.demoSlotError.set('Enter valid start and end times.');
      return;
    }
    if (startAt > endAt) {
      this.demoSlotError.set('The end time must be after the start time.');
      return;
    }
    if (!meetingUrl) {
      this.demoSlotError.set('Enter a meeting link for these slots.');
      return;
    }
    if (!item) return;

    const availableTimes: number[] = [];
    for (let time = startAt; time <= endAt; time += interval * 60_000) {
      if (time > Date.now()) availableTimes.push(time);
    }
    if (!availableTimes.length) {
      this.demoSlotError.set('Choose a time range that includes a future slot.');
      return;
    }

    const slots: DemoSlotInput[] = item.demoSlots.map(({ provider, meetingUrl, scheduledAt }) => ({ provider, meetingUrl: meetingUrl ?? '', scheduledAt }));
    const existingTimes = new Set(item.demoSlots.map(({ scheduledAt }) => new Date(scheduledAt).getTime()));
    const newTimes = availableTimes.filter((time) => !existingTimes.has(time));
    if (!newTimes.length) {
      this.demoSlotError.set('Those demo times are already published.');
      return;
    }
    if (slots.length + newTimes.length > 20) {
      this.demoSlotError.set('A requirement can have up to 20 demo slots. Remove a slot or shorten the time range.');
      return;
    }
    slots.push(...newTimes.map((time) => ({
      provider: this.demoProvider(),
      meetingUrl,
      scheduledAt: new Date(time).toISOString(),
    })));
    this.saveDemoSlots(slots);
  }

  protected removeDemoSlot(slot: DemoSlotView): void {
    const item = this.requirement();
    if (!item || !slot.available) return;
    this.saveDemoSlots(item.demoSlots.filter((candidate) => candidate.scheduledAt !== slot.scheduledAt)
      .map(({ provider, meetingUrl, scheduledAt }) => ({ provider, meetingUrl: meetingUrl ?? '', scheduledAt })));
  }

  protected bookDemoSlot(): void {
    const application = this.myApplication();
    const scheduledAt = this.selectedDemoSlot();
    if (!application || !scheduledAt) return;
    this.applicationBusy.set(application.id);
    this.api.bookDemoSlot(application.id, { scheduledAt }).pipe(finalize(() => this.applicationBusy.set(null))).subscribe({
      next: ({ data }) => {
        this.myApplication.set(data);
        this.load();
        this.successMessage.set('Demo slot booked. Use the meeting link at the selected time.');
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  private saveDemoSlots(slots: DemoSlotInput[]): void {
    this.savingDemoSlots.set(true);
    this.demoSlotError.set(null);
    this.api.updateRequirementDemoSlots(this.id, { slots }).pipe(finalize(() => this.savingDemoSlots.set(false))).subscribe({
      next: ({ data }) => {
        this.requirement.set(data);
        this.demoSlotDate.set('');
        this.successMessage.set('Demo slots updated.');
      },
      error: (error: unknown) => this.demoSlotError.set(describeHttpError(error)),
    });
  }

  protected applicationStatusLabel(status: ApplicationStatus): string {
    if (status === 'OnHold') return 'On hold';
    if (status === 'InterviewScheduled') return 'Interview scheduled';
    return status;
  }

  protected applicationFeedback(application: ApplicationView): string {
    return this.applicationFeedbackNotes()[application.id] ?? application.decisionNote ?? '';
  }

  protected updateApplicationFeedback(application: ApplicationView, value: string): void {
    this.applicationFeedbackNotes.update((notes) => ({ ...notes, [application.id]: value }));
  }

  protected canRateTrainer(application: ApplicationView): boolean {
    return application.status === 'Accepted' && application.requirement.endDate < new Date().toISOString().slice(0, 10);
  }

  protected trainerRating(application: ApplicationView): number {
    return this.trainerRatingDrafts()[application.id] ?? application.trainerRating ?? 0;
  }

  protected trainerReview(application: ApplicationView): string {
    return this.trainerReviewDrafts()[application.id] ?? application.trainerReview ?? '';
  }

  protected updateTrainerRating(application: ApplicationView, value: string): void {
    this.trainerRatingDrafts.update((ratings) => ({ ...ratings, [application.id]: Number(value) }));
  }

  protected updateTrainerReview(application: ApplicationView, value: string): void {
    this.trainerReviewDrafts.update((reviews) => ({ ...reviews, [application.id]: value }));
  }

  protected saveTrainerRating(application: ApplicationView): void {
    const rating = this.trainerRating(application);
    if (!this.canRateTrainer(application) || !Number.isInteger(rating) || rating < 1 || rating > 5 || this.ratingBusy() === application.id) return;
    this.ratingBusy.set(application.id);
    this.api.rateTrainerProject(application.id, { rating, review: this.trainerReview(application).trim() || null })
      .pipe(finalize(() => this.ratingBusy.set(null)))
      .subscribe({
        next: ({ data }) => {
          this.replaceApplication(data);
          this.successMessage.set('Project rating saved and shared with the trainer.');
        },
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
  }

  protected decideApplication(application: ApplicationView, status: 'Accepted' | 'Rejected' | 'OnHold'): void {
    if (status === 'Accepted' && application.status !== 'InterviewScheduled' && application.status !== 'OnHold') return;
    if (status === 'OnHold' && application.status !== 'InterviewScheduled') return;
    this.applicationBusy.set(application.id);
    this.api.decideApplication(application.id, { status, decisionNote: this.applicationFeedback(application).trim() || null }).pipe(finalize(() => this.applicationBusy.set(null))).subscribe({
      next: ({ data }) => {
        this.replaceApplication(data);
        this.applicationFeedbackNotes.update((notes) => ({ ...notes, [application.id]: data.decisionNote ?? '' }));
        this.successMessage.set(status === 'Accepted'
          ? 'Trainer selected. Contact details are now available.'
          : status === 'OnHold' ? 'Application placed on hold. Feedback sent to the trainer.' : 'Application rejected. Feedback sent to the trainer.');
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  private loadMyApplication(): void {
    this.api.getMyApplication(this.id).subscribe({
      next: ({ data }) => { this.myApplication.set(data); this.myApplicationLoaded.set(true); },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  private loadTrainerProfile(): void {
    this.api.getTrainerProfile().pipe(finalize(() => this.trainerProfileLoaded.set(true))).subscribe({
      next: ({ data }) => {
        this.trainerProfile.set(data);
        const resumeUrl = data.resumeUrl?.trim() ?? '';
        this.savedResumeUrl.set(resumeUrl);
        this.savedResumeFileName.set(data.resumeFileName?.trim() || this.resumeNameFromUrl(resumeUrl));
        if (!this.resumeUrl()) this.resumeUrl.set(resumeUrl);
        if (!this.contactPhoneInput()) this.contactPhoneInput.set(data.phone ?? '');
        if (!this.skillsInput()) this.skillsInput.set(data.skills.join(', '));
        if (!this.locationInput()) this.locationInput.set(data.location);
        if (!this.expectedRate()) this.expectedRate.set(data.expectedRate?.toString() ?? '');
        if (!this.githubUrl()) this.githubUrl.set(data.githubUrl ?? '');
        if (!this.linkedinUrl()) this.linkedinUrl.set(data.linkedinUrl ?? '');
        if (!this.leetcodeUrl()) this.leetcodeUrl.set(data.leetcodeUrl ?? '');
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  private resumeNameFromUrl(url: string): string | null {
    try {
      return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '') || null;
    } catch {
      return null;
    }
  }

  private loadApplications(): void {
    this.api.listRequirementApplications(this.id).subscribe({
      next: ({ data }) => {
        this.applications.set(data);
        if (this.notificationTarget) {
          window.setTimeout(() => document.getElementById(this.notificationTarget!)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
        }
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  private replaceApplication(application: ApplicationView): void {
    this.applications.update((items) => items.map((item) => item.id === application.id ? application : item));
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

  protected whatsappUrl(phone: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    const internationalNumber = digits.length === 10 ? `91${digits}` : digits;
    return internationalNumber.length >= 11 && internationalNumber.length <= 15
      ? `https://wa.me/${internationalNumber}`
      : null;
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

  protected requirementDescription(item: RequirementDetail): string | null {
    const description = item.description.trim();
    if (!description) return 'No description provided.';

    const importedText = item.sources.find((source) => source.sourceType === 'Import' && source.rawText)?.rawText;
    if (importedText) {
      const sourceDescription = importedText.split(/\r?\n/).filter((line) =>
        !/^\s*(?:contact|contact person|phone|mobile|email|organization|organisation|company)\s*[:=]/i.test(line)
        && !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line)
        && !/(?:\+?\d[\d\s-]{8,14}\d)/.test(line),
      ).join('\n');
      const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
      const normalizedDescription = normalizeText(description);
      if (normalizedDescription.length > 100 && normalizeText(sourceDescription).includes(normalizedDescription)) return null;
    }

    return description;
  }
}
