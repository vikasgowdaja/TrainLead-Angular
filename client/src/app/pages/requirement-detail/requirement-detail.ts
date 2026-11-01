import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ApplicationView, InterviewProvider, RequirementDetail, RequirementStatus, SourceType, SourceView } from '@trainlead/shared/domain';
import { INTERVIEW_PROVIDERS, SOURCE_TYPES } from '@trainlead/shared/domain';
import { finalize } from 'rxjs';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-requirement-detail',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './requirement-detail.html',
})
export class RequirementDetailPage {
  private readonly api = inject(MarketplaceService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
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
  protected readonly myApplication = signal<ApplicationView | null>(null);
  protected readonly myApplicationLoaded = signal(false);
  protected readonly applications = signal<ApplicationView[]>([]);
  protected readonly interviewProviders = INTERVIEW_PROVIDERS;
  protected readonly coverNote = signal('');
  protected readonly expectedRate = signal('');
  protected readonly applying = signal(false);
  protected readonly applicationBusy = signal<string | null>(null);
  protected readonly interviewDrafts = signal<Record<string, { provider: InterviewProvider; meetingUrl: string; scheduledAt: string; notes: string }>>({});

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.getRequirement(this.id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ data }) => {
        this.requirement.set(data);
        if (data.canManage) this.loadApplications();
        else if (this.auth.hasRole('Trainer')) this.loadMyApplication();
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected isTrainer(): boolean {
    return this.auth.hasRole('Trainer');
  }

  protected apply(): void {
    if (this.applying()) return;
    const rawRate = this.expectedRate().trim();
    const expectedRate = rawRate ? Number(rawRate) : null;
    if (rawRate && (!Number.isFinite(expectedRate) || expectedRate! < 0)) {
      this.errorMessage.set('Enter a valid non-negative expected rate.');
      return;
    }
    this.applicationBusy.set(null);
    this.applying.set(true);
    this.api.applyToRequirement(this.id, { coverNote: this.coverNote().trim(), expectedRate }).pipe(finalize(() => this.applying.set(false))).subscribe({
      next: ({ data }) => {
        this.myApplication.set(data);
        this.successMessage.set('Application sent to the Vendor.');
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected updateInterviewDraft(application: ApplicationView, field: 'provider' | 'meetingUrl' | 'scheduledAt' | 'notes', value: string): void {
    const current = this.interviewDrafts()[application.id] ?? {
      provider: application.interview?.provider ?? 'Google Meet',
      meetingUrl: application.interview?.meetingUrl ?? '',
      scheduledAt: application.interview ? this.toLocalDateTime(application.interview.scheduledAt) : '',
      notes: application.interview?.notes ?? '',
    };
    this.interviewDrafts.update((drafts) => ({
      ...drafts,
      [application.id]: { ...current, [field]: value } as typeof current,
    }));
  }

  protected interviewDraft(application: ApplicationView) {
    return this.interviewDrafts()[application.id] ?? {
      provider: application.interview?.provider ?? 'Google Meet',
      meetingUrl: application.interview?.meetingUrl ?? '',
      scheduledAt: application.interview ? this.toLocalDateTime(application.interview.scheduledAt) : '',
      notes: application.interview?.notes ?? '',
    };
  }

  protected scheduleInterview(application: ApplicationView): void {
    const draft = this.interviewDraft(application);
    const scheduledAt = draft.scheduledAt ? new Date(draft.scheduledAt) : null;
    if (!draft.meetingUrl.trim() || !scheduledAt || !Number.isFinite(scheduledAt.getTime())) {
      this.errorMessage.set('Choose a meeting provider, valid meeting URL, and interview time.');
      return;
    }
    this.applicationBusy.set(application.id);
    this.api.scheduleApplicationInterview(application.id, {
      ...draft,
      meetingUrl: draft.meetingUrl.trim(),
      scheduledAt: scheduledAt.toISOString(),
    }).pipe(finalize(() => this.applicationBusy.set(null))).subscribe({
      next: ({ data }) => {
        this.replaceApplication(data);
        this.successMessage.set('Video interview scheduled or updated.');
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  protected decideApplication(application: ApplicationView, status: 'Accepted' | 'Rejected'): void {
    if (status === 'Accepted' && application.status !== 'InterviewScheduled') return;
    this.applicationBusy.set(application.id);
    this.api.decideApplication(application.id, { status, decisionNote: null }).pipe(finalize(() => this.applicationBusy.set(null))).subscribe({
      next: ({ data }) => {
        this.replaceApplication(data);
        this.successMessage.set(status === 'Accepted' ? 'Trainer accepted. Contact details are now available.' : 'Application rejected.');
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

  private loadApplications(): void {
    this.api.listRequirementApplications(this.id).subscribe({
      next: ({ data }) => this.applications.set(data),
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }

  private replaceApplication(application: ApplicationView): void {
    this.applications.update((items) => items.map((item) => item.id === application.id ? application : item));
  }

  private toLocalDateTime(value: string): string {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
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
