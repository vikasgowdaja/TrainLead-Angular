import { Component, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { RequirementQuery } from '@trainlead/shared';
import type { DashboardStats, InboxItemView, RequirementSummary } from '@trainlead/shared/domain';
import { DELIVERY_MODES, REQUIREMENT_STATUSES, REQUIREMENT_SORTS } from '@trainlead/shared/domain';
import { Subject, debounceTime, distinctUntilChanged, finalize, forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';
import { RequirementCard } from '../../requirement-card/requirement-card';
import type { Requirement } from '../../requirement.model';

@Component({
  selector: 'app-marketplace-page',
  imports: [RequirementCard, RouterLink, TitleCasePipe],
  templateUrl: './marketplace.html',
})
export class MarketplacePage {
  private readonly router = inject(Router);
  private readonly marketplace = inject(MarketplaceService);
  protected readonly auth = inject(AuthService);

  protected readonly activeView = signal<'requirements' | 'inbox'>('requirements');
  protected readonly darkMode = signal(false);
  protected readonly requirements = signal<Requirement[]>([]);
  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly posts = signal<InboxItemView[]>([]);
  protected readonly filters = signal<RequirementQuery>({ sort: 'newest', page: 1, limit: 10 });
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly inboxLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly inboxError = signal<string | null>(null);
  protected readonly captureText = signal('');
  protected readonly capturing = signal(false);
  protected readonly statuses = REQUIREMENT_STATUSES;
  protected readonly modes = DELIVERY_MODES;
  protected readonly sorts = REQUIREMENT_SORTS;
  private readonly searchChanges = new Subject<string>();
  private inboxLoaded = false;
  protected readonly initials = computed(() =>
    (this.auth.currentUser()?.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );

  protected readonly cards = computed(() => this.requirements());

  constructor() {
    this.searchChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((q) => {
      this.updateFilters({ q: q || undefined });
    });
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

  protected setFilter(key: 'city' | 'skill' | 'status' | 'mode' | 'sort', value: string): void {
    this.updateFilters({ [key]: value || undefined });
  }

  protected setDateFilter(key: 'startFrom' | 'startTo', value: string): void {
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
    this.marketplace.captureInbox({ rawText, sourceType: 'WhatsApp', groupName: '' })
      .pipe(finalize(() => this.capturing.set(false)))
      .subscribe({
        next: ({ data }) => {
          this.posts.update((posts) => [...data, ...posts]);
          this.captureText.set('');
          this.refreshStats();
        },
        error: (error: unknown) => this.inboxError.set(describeHttpError(error)),
      });
  }

  protected discardInbox(id: string): void {
    if (!globalThis.confirm('Discard this captured message?')) return;
    this.marketplace.discardInbox(id).subscribe({
      next: () => { this.posts.update((posts) => posts.filter((post) => post.id !== id)); this.refreshStats(); },
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
      groupId: item.groupId,
      stack: item.skills,
      dateLabel: `${this.formatDate(item.startDate)} - ${this.formatDate(item.endDate)}`,
      durationDays: item.durationDays,
      city: item.city,
      audience: item.audience,
      tfa: item.travel,
      paymentDate: item.paymentDueDate ? this.formatDate(item.paymentDueDate) : null,
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
