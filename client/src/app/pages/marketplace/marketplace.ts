import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { RequirementQuery } from '@trainlead/shared';
import type { ApplicationNotificationView, DashboardStats, ExtractedRequirement, InboxItemView, RequirementSummary, SourceType, TrainerNotificationView } from '@trainlead/shared/domain';
import { DELIVERY_MODES, REQUIREMENT_STATUSES, REQUIREMENT_SORTS, SOURCE_TYPES } from '@trainlead/shared/domain';
import type { RequirementInput } from '@trainlead/shared';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, finalize, forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';
import { RequirementCard } from '../../requirement-card/requirement-card';
import type { Requirement } from '../../requirement.model';

@Component({
  selector: 'app-marketplace-page',
  imports: [RequirementCard, RouterLink, DatePipe, TitleCasePipe],
  templateUrl: './marketplace.html',
})
export class MarketplacePage {
  private readonly router = inject(Router);
  private readonly marketplace = inject(MarketplaceService);
  protected readonly auth = inject(AuthService);

  protected readonly activeView = signal<'requirements' | 'inbox'>('requirements');
  protected readonly darkMode = signal(false);
  protected readonly requirements = signal<Requirement[]>([]);
  protected readonly trainerPhotoUrl = signal<string | null>(null);
  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly posts = signal<InboxItemView[]>([]);
  protected readonly filters = signal<RequirementQuery>({ sort: 'newest', page: 1, limit: 10 });
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly inboxLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly inboxError = signal<string | null>(null);
  protected readonly captureText = signal('');
  protected readonly captureGroup = signal('');
  protected readonly captureSourceType = signal<SourceType>('WhatsApp');
  protected readonly capturing = signal(false);
  protected readonly organizationNeeded = signal(false);
  protected readonly organizationExists = signal(false);
  protected readonly inboxEdits = signal<Record<string, Partial<ExtractedRequirement>>>({});
  protected readonly applicationNotifications = signal<ApplicationNotificationView[]>([]);
  protected readonly trainerNotifications = signal<TrainerNotificationView[]>([]);
  protected readonly pendingApplicationCount = signal(0);
  protected readonly unreadTrainerNotificationCount = signal(0);
  protected readonly notificationsOpen = signal(false);
  protected readonly accountMenuOpen = signal(false);
  protected readonly notificationsLoading = signal(false);
  protected readonly notificationsError = signal<string | null>(null);
  protected readonly statuses = REQUIREMENT_STATUSES;
  protected readonly modes = DELIVERY_MODES;
  protected readonly sorts = REQUIREMENT_SORTS;
  protected readonly sourceTypes = SOURCE_TYPES;
  private readonly searchChanges = new Subject<string>();
  private readonly textFilterChanges = new Subject<{ key: 'city' | 'skill'; value: string }>();
  private inboxLoaded = false;
  protected readonly initials = computed(() =>
    (this.auth.currentUser()?.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
  protected readonly welcomeName = computed(() => this.auth.currentUser()?.name.trim() || 'there');

  protected readonly cards = computed(() => this.requirements());

  constructor() {
    this.searchChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((q) => {
      this.updateFilters({ q: q || undefined });
    });
    this.textFilterChanges.pipe(debounceTime(250), takeUntilDestroyed()).subscribe(({ key, value }) => {
      this.updateFilters({ [key]: value || undefined });
    });
    if (this.auth.hasRole('Trainer')) {
      this.loadTrainerNotifications();
      this.marketplace.getTrainerProfile().pipe(takeUntilDestroyed()).subscribe({
        next: ({ data }) => this.trainerPhotoUrl.set(data.photoUrl),
      });
    }
    if (this.auth.hasRole('Vendor')) {
      this.loadApplicationNotifications();
      this.marketplace.getMyOrganization().pipe(
        catchError((error: unknown) => {
          if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409) {
            this.organizationNeeded.set(true);
            return EMPTY;
          }
          this.errorMessage.set(describeHttpError(error));
          return EMPTY;
        }),
        takeUntilDestroyed(),
      ).subscribe(({ data }) => {
        if (data) this.organizationExists.set(true);
      });
    }
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    forkJoin({ page: this.marketplace.listRequirements(this.filters()), stats: this.marketplace.getStats() })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ page, stats }) => {
          this.requirements.set(page.data.map((item) => this.toCard(item)));
          this.hasMore.set(page.hasMore);
          this.stats.set(stats.data);
        },
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
  }

  protected toggleNotifications(): void {
    const open = !this.notificationsOpen();
    this.notificationsOpen.set(open);
    if (open) {
      if (this.auth.hasRole('Trainer')) this.loadTrainerNotifications();
      else this.loadApplicationNotifications();
    }
  }

  protected closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  protected markTrainerNotificationRead(notification: TrainerNotificationView): void {
    this.closeNotifications();
    if (notification.readAt) return;
    const readAt = new Date().toISOString();
    this.trainerNotifications.update((items) => items.map((item) => item.id === notification.id ? { ...item, readAt } : item));
    this.unreadTrainerNotificationCount.update((count) => Math.max(0, count - 1));
    this.marketplace.markTrainerNotificationRead(notification.id).subscribe({
      error: (error: unknown) => this.notificationsError.set(describeHttpError(error)),
    });
  }

  protected toggleAccountMenu(): void {
    this.accountMenuOpen.update((open) => !open);
  }

  protected closeAccountMenu(): void {
    this.accountMenuOpen.set(false);
  }

  private loadApplicationNotifications(): void {
    this.notificationsLoading.set(true);
    this.notificationsError.set(null);
    this.marketplace.getApplicationNotifications().pipe(finalize(() => this.notificationsLoading.set(false))).subscribe({
      next: ({ data, pendingCount }) => {
        this.applicationNotifications.set(data);
        this.pendingApplicationCount.set(pendingCount);
      },
      error: (error: unknown) => this.notificationsError.set(describeHttpError(error)),
    });
  }

  private loadTrainerNotifications(): void {
    this.notificationsLoading.set(true);
    this.notificationsError.set(null);
    this.marketplace.getTrainerNotifications().pipe(finalize(() => this.notificationsLoading.set(false))).subscribe({
      next: ({ data, unreadCount }) => {
        this.trainerNotifications.set(data);
        this.unreadTrainerNotificationCount.set(unreadCount);
      },
      error: (error: unknown) => this.notificationsError.set(describeHttpError(error)),
    });
  }

  protected loadMore(): void {
    if (!this.hasMore() || this.loadingMore()) return;
    const nextPage = (this.filters().page ?? 1) + 1;
    this.loadingMore.set(true);
    this.marketplace.listRequirements({ ...this.filters(), page: nextPage })
      .pipe(finalize(() => this.loadingMore.set(false)))
      .subscribe({
        next: (page) => {
          this.requirements.update((current) => [...current, ...page.data.map((item) => this.toCard(item))]);
          this.filters.update((current) => ({ ...current, page: nextPage }));
          this.hasMore.set(page.hasMore);
        },
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
  }

  protected search(value: string): void {
    this.searchChanges.next(value.trim());
  }

  protected setFilter(key: 'vendor' | 'status' | 'mode' | 'sort', value: string): void {
    this.updateFilters({ [key]: value || undefined });
  }

  protected setTextFilter(key: 'city' | 'skill', value: string): void {
    this.textFilterChanges.next({ key, value: value.trim() });
  }

  protected setDateFilter(key: 'startFrom' | 'startTo' | 'endFrom' | 'endTo', value: string): void {
    this.updateFilters({ [key]: value || undefined });
  }

  protected setBooleanFilter(key: 'repeated' | 'hasPaymentDate', event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.updateFilters({ [key]: checked ? true : undefined });
  }

  protected updateFilters(changes: Partial<RequirementQuery>): void {
    this.filters.update((current) => ({ ...current, ...changes, page: 1 }));
    this.reloadList();
  }

  protected loadInbox(): void {
    if (this.inboxLoaded || this.inboxLoading()) return;
    this.inboxLoading.set(true);
    this.inboxError.set(null);
    this.marketplace.listInbox()
      .pipe(finalize(() => this.inboxLoading.set(false)))
      .subscribe({
        next: (page) => { this.posts.set(page.data); this.inboxLoaded = true; },
        error: (error: unknown) => this.inboxError.set(describeHttpError(error)),
      });
  }

  protected capture(): void {
    const rawText = this.captureText().trim();
    if (!rawText || this.capturing()) return;
    this.capturing.set(true);
    this.marketplace.captureInbox({ rawText, sourceType: this.captureSourceType(), groupName: this.captureGroup() })
      .pipe(finalize(() => this.capturing.set(false)))
      .subscribe({
        next: ({ data }) => {
          this.posts.update((posts) => [...data, ...posts]);
          this.captureText.set('');
          this.captureGroup.set('');
          this.successMessage.set('Message captured for review.');
          this.refreshStats();
        },
        error: (error: unknown) => this.inboxError.set(describeHttpError(error)),
      });
  }

  protected discardInbox(id: string): void {
    if (!globalThis.confirm('Discard this captured message?')) return;
    this.marketplace.discardInbox(id).subscribe({
      next: () => { this.posts.update((posts) => posts.filter((post) => post.id !== id)); this.successMessage.set('Captured message discarded.'); this.refreshStats(); },
      error: (error: unknown) => this.inboxError.set(describeHttpError(error)),
    });
  }

  protected inboxText(post: InboxItemView, key: 'title' | 'city' | 'audience' | 'startDate' | 'endDate'): string {
    return String(this.inboxEdits()[post.id]?.[key] ?? post.extracted[key] ?? '');
  }

  protected inboxSkills(post: InboxItemView): string {
    const skills = this.inboxEdits()[post.id]?.skills ?? post.extracted.skills ?? [];
    return skills.join(', ');
  }

  protected inboxDuration(post: InboxItemView): number | null {
    return this.inboxEdits()[post.id]?.durationDays ?? post.extracted.durationDays ?? null;
  }

  protected editInboxText(postId: string, key: 'title' | 'city' | 'audience' | 'startDate' | 'endDate', value: string): void {
    this.inboxEdits.update((edits) => ({ ...edits, [postId]: { ...edits[postId], [key]: value } }));
  }

  protected editInboxSkills(postId: string, value: string): void {
    const skills = value.split(',').map((skill) => skill.trim()).filter(Boolean);
    this.inboxEdits.update((edits) => ({ ...edits, [postId]: { ...edits[postId], skills } }));
  }

  protected editInboxDuration(postId: string, value: string): void {
    const durationDays = Number(value);
    this.inboxEdits.update((edits) => ({ ...edits, [postId]: { ...edits[postId], durationDays: durationDays > 0 ? durationDays : undefined } }));
  }

  protected saveInboxReview(post: InboxItemView): void {
    const extracted = this.inboxEdits()[post.id];
    if (!extracted || Object.keys(extracted).length === 0) return;
    this.marketplace.updateInbox(post.id, extracted).subscribe({
      next: ({ data }) => { this.posts.update((posts) => posts.map((current) => current.id === post.id ? data : current)); this.successMessage.set('Review saved.'); },
      error: (error: unknown) => this.inboxError.set(describeHttpError(error)),
    });
  }

  protected retryInbox(post: InboxItemView): void {
    this.marketplace.retryInbox(post.id).subscribe({
      next: ({ data }) => { this.posts.update((posts) => posts.map((current) => current.id === post.id ? data : current)); this.successMessage.set('Extraction retried.'); },
      error: (error: unknown) => this.inboxError.set(describeHttpError(error)),
    });
  }

  protected canConvertInbox(post: InboxItemView): boolean {
    const fields = { ...post.extracted, ...this.inboxEdits()[post.id] };
    return Boolean(fields.title && fields.skills?.length && fields.city && fields.startDate && fields.endDate && fields.durationDays && fields.audience);
  }

  protected convertInbox(post: InboxItemView): void {
    const fields = { ...post.extracted, ...this.inboxEdits()[post.id] };
    if (!this.canConvertInbox(post)) return;
    const requirement: RequirementInput = {
      title: fields.title!, description: fields.description ?? '', domain: '', skills: fields.skills!,
      city: fields.city!, state: fields.state ?? '', mode: fields.mode ?? 'Offline',
      startDate: fields.startDate!, endDate: fields.endDate!, durationDays: fields.durationDays!,
      audience: fields.audience!, studentCount: fields.studentCount ?? null, experienceRequired: '',
      budgetMin: fields.budgetMin ?? null, budgetMax: fields.budgetMax ?? null,
      paymentTerms: fields.paymentTerms ?? null, paymentDueDate: fields.paymentDueDate ?? null,
      travel: fields.travel ?? 'Unknown', food: fields.food ?? 'Unknown', stay: fields.stay ?? 'Unknown',
    };
    this.marketplace.convertInbox(post.id, { requirement, publish: true }).subscribe({
      next: ({ data }) => {
        this.posts.update((posts) => posts.filter((current) => current.id !== post.id));
        this.refreshStats();
        void this.router.navigate(['/requirements', data.id]);
      },
      error: (error: unknown) => this.inboxError.set(describeHttpError(error)),
    });
  }

  protected setView(view: 'requirements' | 'inbox'): void {
    this.activeView.set(view);
    if (view === 'inbox') this.loadInbox();
  }

  protected toggleTheme(): void {
    this.darkMode.update((isDark) => !isDark);
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigateByUrl('/login'));
  }

  protected updatedLabel(): string {
    const date = this.stats()?.lastUpdatedAt;
    return date ? `UPDATED ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))}` : 'NO RECENT UPDATES';
  }

  protected todayLabel(): string {
    return new Intl.DateTimeFormat('en-IN', { weekday: 'short', month: 'short', day: '2-digit' }).format(new Date()).toUpperCase();
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  }

  protected formatReceived(value: string): string {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  protected canCreate(): boolean {
    return this.auth.hasRole('Vendor', 'Admin');
  }

  private reloadList(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.marketplace.listRequirements(this.filters())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (page) => { this.requirements.set(page.data.map((item) => this.toCard(item))); this.hasMore.set(page.hasMore); },
        error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
      });
  }

  private refreshStats(): void {
    this.marketplace.getStats().subscribe({ next: (response) => this.stats.set(response.data) });
  }

  private toCard(item: RequirementSummary): Requirement {
    const sourceNames = item.vendors.map((vendor) => vendor.name);
    return {
      id: item.id,
      title: item.title,
      status: item.status,
      canManage: item.canManage,
      canApply: this.auth.hasRole('Trainer'),
      groupId: item.groupId,
      stack: item.skills,
      dateLabel: `${this.formatDate(item.startDate)} - ${this.formatDate(item.endDate)}`,
      durationDays: item.durationDays,
      city: item.city,
      audience: item.audience,
      tfa: item.travel,
      paymentDate: item.paymentDueDate ? this.formatDate(item.paymentDueDate) : null,
      pendingApplications: item.pendingApplications,
      postingCount: item.sourceCount,
      groupCount: sourceNames.length,
      sources: sourceNames,
      support: [
        { label: 'Travel', status: item.travel },
        { label: 'Food', status: item.food },
        { label: 'Stay', status: item.stay },
      ],
    };
  }
}
