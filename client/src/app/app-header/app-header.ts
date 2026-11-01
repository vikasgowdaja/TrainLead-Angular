import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ApplicationNotificationView, TrainerNotificationView } from '@trainlead/shared/domain';
import { EMPTY, catchError, finalize } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { describeHttpError } from '../core/http-error';
import { MarketplaceService } from '../core/marketplace.service';

@Component({
  selector: 'app-header',
  imports: [DatePipe, RouterLink],
  templateUrl: './app-header.html',
})
export class AppHeader {
  private readonly router = inject(Router);
  private readonly marketplace = inject(MarketplaceService);
  protected readonly auth = inject(AuthService);
  readonly darkMode = input(false);
  protected readonly themeToggle = output<void>();
  protected readonly trainerPhotoUrl = signal<string | null>(null);
  protected readonly organizationNeeded = signal(false);
  protected readonly organizationExists = signal(false);
  protected readonly applicationNotifications = signal<ApplicationNotificationView[]>([]);
  protected readonly trainerNotifications = signal<TrainerNotificationView[]>([]);
  protected readonly pendingApplicationCount = signal(0);
  protected readonly unreadTrainerNotificationCount = signal(0);
  protected readonly notificationsOpen = signal(false);
  protected readonly accountMenuOpen = signal(false);
  protected readonly notificationsLoading = signal(false);
  protected readonly notificationsError = signal<string | null>(null);
  protected readonly initials = computed(() =>
    (this.auth.currentUser()?.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );

  constructor() {
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
          this.notificationsError.set(describeHttpError(error));
          return EMPTY;
        }),
        takeUntilDestroyed(),
      ).subscribe(({ data }) => this.organizationExists.set(Boolean(data)));
    }
  }

  protected toggleNotifications(): void {
    const open = !this.notificationsOpen();
    this.notificationsOpen.set(open);
    if (!open) return;
    if (this.auth.hasRole('Trainer')) this.loadTrainerNotifications();
    else this.loadApplicationNotifications();
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

  protected logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigateByUrl('/login'));
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
}