import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { OrganizationView, VerificationStatus } from '@trainlead/shared/domain';
import { VERIFICATION_STATUSES } from '@trainlead/shared/domain';
import { MarketplaceService } from '../../core/marketplace.service';
import { describeHttpError } from '../../core/http-error';

@Component({
  selector: 'app-admin-organizations',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-organizations.html',
})
export class AdminOrganizationsPage {
  private readonly api = inject(MarketplaceService);
  protected readonly organizations = signal<OrganizationView[]>([]);
  protected readonly notes = signal<Record<string, string>>({});
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly verificationStatuses = VERIFICATION_STATUSES;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.listOrganizations().subscribe({
      next: ({ data }) => { this.organizations.set(data); this.loading.set(false); },
      error: (error: unknown) => { this.errorMessage.set(describeHttpError(error)); this.loading.set(false); },
    });
  }

  protected setNote(id: string, value: string): void {
    this.notes.update((notes) => ({ ...notes, [id]: value }));
  }

  protected review(organization: OrganizationView, verificationStatus: VerificationStatus): void {
    const note = this.notes()[organization.id]?.trim() || null;
    this.api.reviewOrganization(organization.id, verificationStatus, note).subscribe({
      next: ({ data }) => {
        this.organizations.update((items) => items.map((item) => item.id === data.id ? data : item));
        this.successMessage.set(`${data.name} marked ${data.verificationStatus}.`);
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }
}
