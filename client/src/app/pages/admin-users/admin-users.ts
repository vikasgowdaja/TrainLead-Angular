import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Role } from '@trainlead/shared';
import { describeHttpError } from '../../core/http-error';

interface AdminUserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  createdAt: string;
}

@Component({
  selector: 'app-admin-users-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './admin-users.html',
})
export class AdminUsersPage {
  protected readonly users = signal<AdminUserRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    inject(HttpClient)
      .get<{ data: AdminUserRow[] }>('/api/admin/users')
      .subscribe({
        next: (response) => {
          this.users.set(response.data);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errorMessage.set(describeHttpError(error));
          this.loading.set(false);
        },
      });
  }
}
