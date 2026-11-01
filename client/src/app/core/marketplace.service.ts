import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { InboxCaptureInput, OrganizationInput, RequirementInput, RequirementQuery, SourceInput } from '@trainlead/shared';
import type {
  DashboardStats,
  InboxItemView,
  OrganizationView,
  Page,
  RequirementDetail,
  RequirementStatus,
  RequirementSummary,
} from '@trainlead/shared/domain';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private readonly http = inject(HttpClient);

  listRequirements(query: RequirementQuery): Observable<Page<RequirementSummary>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Page<RequirementSummary>>('/api/requirements', { params });
  }

  getStats(): Observable<{ data: DashboardStats }> {
    return this.http.get<{ data: DashboardStats }>('/api/requirements/stats');
  }

  getMyOrganization(): Observable<{ data: OrganizationView }> {
    return this.http.get<{ data: OrganizationView }>('/api/organizations/me');
  }

  createOrganization(input: OrganizationInput): Observable<{ data: OrganizationView }> {
    return this.http.post<{ data: OrganizationView }>('/api/organizations', input);
  }

  getRequirement(id: string): Observable<{ data: RequirementDetail }> {
    return this.http.get<{ data: RequirementDetail }>(`/api/requirements/${id}`);
  }

  createRequirement(input: { requirement: RequirementInput; publish: boolean; source?: SourceInput }): Observable<{ data: RequirementDetail }> {
    return this.http.post<{ data: RequirementDetail }>('/api/requirements', input);
  }

  updateRequirement(id: string, input: RequirementInput): Observable<{ data: RequirementDetail }> {
    return this.http.put<{ data: RequirementDetail }>(`/api/requirements/${id}`, input);
  }

  changeStatus(id: string, status: RequirementStatus): Observable<{ data: RequirementDetail }> {
    return this.http.patch<{ data: RequirementDetail }>(`/api/requirements/${id}/status`, { status });
  }

  deleteRequirement(id: string): Observable<void> {
    return this.http.delete<void>(`/api/requirements/${id}`);
  }

  duplicateRequirement(id: string): Observable<{ data: RequirementDetail }> {
    return this.http.post<{ data: RequirementDetail }>(`/api/requirements/${id}/duplicate`, {});
  }

  listInbox(page = 1): Observable<Page<InboxItemView>> {
    return this.http.get<Page<InboxItemView>>('/api/inbox', { params: { page, limit: 20 } });
  }

  captureInbox(input: InboxCaptureInput): Observable<{ data: InboxItemView[] }> {
    return this.http.post<{ data: InboxItemView[] }>('/api/inbox', input);
  }

  discardInbox(id: string): Observable<void> {
    return this.http.delete<void>(`/api/inbox/${id}`);
  }
}
