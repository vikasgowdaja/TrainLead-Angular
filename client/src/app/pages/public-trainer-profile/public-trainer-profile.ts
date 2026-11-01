import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { PublicTrainerProfileView } from '@trainlead/shared/domain';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';

@Component({
  selector: 'app-public-trainer-profile',
  imports: [DatePipe, RouterLink],
  templateUrl: './public-trainer-profile.html',
})
export class PublicTrainerProfilePage {
  private readonly api = inject(MarketplaceService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  protected readonly profile = signal<PublicTrainerProfileView | null>(null);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.api.getPublicTrainerProfile(this.id).subscribe({
      next: ({ data }) => { this.profile.set(data); this.loading.set(false); },
      error: (error: unknown) => { this.errorMessage.set(describeHttpError(error)); this.loading.set(false); },
    });
  }
}