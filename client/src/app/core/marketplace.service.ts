import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApplicationDecision, ApplyToRequirementInput, BookDemoSlotInput, DemoSlotsUpdateInput, InboxCaptureInput, InterviewScheduleInput, OrganizationInput, RequirementInput, RequirementQuery, SmartExtractionRequest, SourceInput, TrainerProfileUpdateInput } from '@trainlead/shared';
import type {
  ApplicationView,
  ApplicationNotificationView,
  DashboardStats,
  AdminAnalytics,
  ExtractedRequirement,
  InboxItemView,
  OrganizationMemberView,
  OrganizationView,
  Page,
  RequirementDetail,
  RequirementStatus,
  RequirementSummary,
  SourceType,
  TrainerNotificationView,
  VerificationStatus,
  SkillView,
  TrainerProfileView,
  TrainerProfileSuggestions,
  PublicTrainerProfileView,
  SmartExtractionResult,
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

  getAdminAnalytics(): Observable<{ data: AdminAnalytics }> {
    return this.http.get<{ data: AdminAnalytics }>('/api/admin/analytics');
  }

  getMyOrganization(): Observable<{ data: OrganizationView }> {
    return this.http.get<{ data: OrganizationView }>('/api/organizations/me');
  }

  getTrainerProfile(): Observable<{ data: TrainerProfileView }> {
    return this.http.get<{ data: TrainerProfileView }>('/api/trainer-profile/me');
  }

  getPublicTrainerProfile(id: string): Observable<{ data: PublicTrainerProfileView }> {
    return this.http.get<{ data: PublicTrainerProfileView }>(`/api/trainer-profile/${id}/public`);
  }

  updateTrainerProfile(input: TrainerProfileUpdateInput): Observable<{ data: TrainerProfileView }> {
    return this.http.put<{ data: TrainerProfileView }>('/api/trainer-profile/me', input);
  }

  uploadTrainerPhoto(file: File): Observable<{ data: TrainerProfileView }> {
    const body = new FormData();
    body.append('photo', file);
    return this.http.post<{ data: TrainerProfileView }>('/api/trainer-profile/me/photo', body);
  }

  uploadTrainerResume(file: File): Observable<{ data: TrainerProfileView }> {
    const body = new FormData();
    body.append('resume', file);
    return this.http.post<{ data: TrainerProfileView }>('/api/trainer-profile/me/resume', body);
  }

  extractTrainerResume(file: File): Observable<{ data: TrainerProfileSuggestions }> {
    const body = new FormData();
    body.append('resume', file);
    return this.http.post<{ data: TrainerProfileSuggestions }>('/api/trainer-profile/me/resume/extract', body);
  }

  createOrganization(input: OrganizationInput): Observable<{ data: OrganizationView }> {
    return this.http.post<{ data: OrganizationView }>('/api/organizations', input);
  }

  updateOrganization(input: OrganizationInput): Observable<{ data: OrganizationView }> {
    return this.http.put<{ data: OrganizationView }>('/api/organizations/me', input);
  }

  updateOrganizationVerification(verificationStatus: VerificationStatus, verificationNote: string | null): Observable<{ data: OrganizationView }> {
    return this.http.patch<{ data: OrganizationView }>('/api/organizations/me/verification', { verificationStatus, verificationNote });
  }

  sendOrganizationEmailOtp(): Observable<{ data: { expiresInSeconds: number } }> {
    return this.http.post<{ data: { expiresInSeconds: number } }>('/api/organizations/me/email-verification/send', {});
  }

  verifyOrganizationEmailOtp(code: string): Observable<{ data: OrganizationView }> {
    return this.http.post<{ data: OrganizationView }>('/api/organizations/me/email-verification/verify', { code });
  }

  listOrganizationMembers(): Observable<{ data: OrganizationMemberView[] }> {
    return this.http.get<{ data: OrganizationMemberView[] }>('/api/organizations/me/members');
  }

  addOrganizationMember(identifier: string, orgRole: 'owner' | 'recruiter'): Observable<{ data: OrganizationMemberView }> {
    return this.http.post<{ data: OrganizationMemberView }>('/api/organizations/me/members', { identifier, orgRole });
  }

  updateOrganizationMember(userId: string, orgRole: 'owner' | 'recruiter'): Observable<{ data: OrganizationMemberView }> {
    return this.http.patch<{ data: OrganizationMemberView }>(`/api/organizations/me/members/${userId}`, { identifier: userId, orgRole });
  }

  removeOrganizationMember(userId: string): Observable<void> {
    return this.http.delete<void>(`/api/organizations/me/members/${userId}`);
  }

  listOrganizations(): Observable<{ data: OrganizationView[] }> {
    return this.http.get<{ data: OrganizationView[] }>('/api/organizations');
  }

  reviewOrganization(id: string, verificationStatus: VerificationStatus, verificationNote: string | null): Observable<{ data: OrganizationView }> {
    return this.http.patch<{ data: OrganizationView }>(`/api/organizations/${id}/verification`, { verificationStatus, verificationNote });
  }

  listSkills(q = ''): Observable<{ data: SkillView[] }> {
    return this.http.get<{ data: SkillView[] }>('/api/skills', { params: q ? { q } : {} });
  }

  suggestSkill(input: { name: string; domain: string; aliases: string[] }): Observable<{ data: SkillView; existing: boolean }> {
    return this.http.post<{ data: SkillView; existing: boolean }>('/api/skills', input);
  }

  updateSkill(id: string, input: { name?: string; domain?: string; aliases?: string[]; verified?: boolean }): Observable<{ data: SkillView }> {
    return this.http.put<{ data: SkillView }>(`/api/skills/${id}`, input);
  }

  getRequirement(id: string): Observable<{ data: RequirementDetail }> {
    return this.http.get<{ data: RequirementDetail }>(`/api/requirements/${id}`);
  }

  updateRequirementDemoSlots(id: string, input: DemoSlotsUpdateInput): Observable<{ data: RequirementDetail }> {
    return this.http.put<{ data: RequirementDetail }>(`/api/requirements/${id}/demo-slots`, input);
  }

  applyToRequirement(requirementId: string, input: ApplyToRequirementInput): Observable<{ data: ApplicationView }> {
    return this.http.post<{ data: ApplicationView }>(`/api/applications/requirements/${requirementId}`, input);
  }

  getMyApplication(requirementId: string): Observable<{ data: ApplicationView | null }> {
    return this.http.get<{ data: ApplicationView | null }>(`/api/applications/requirements/${requirementId}/mine`);
  }

  listRequirementApplications(requirementId: string): Observable<{ data: ApplicationView[] }> {
    return this.http.get<{ data: ApplicationView[] }>(`/api/applications/requirements/${requirementId}`);
  }

  getApplicationNotifications(): Observable<{ data: ApplicationNotificationView[]; pendingCount: number }> {
    return this.http.get<{ data: ApplicationNotificationView[]; pendingCount: number }>('/api/applications/notifications');
  }

  getTrainerNotifications(): Observable<{ data: TrainerNotificationView[]; unreadCount: number }> {
    return this.http.get<{ data: TrainerNotificationView[]; unreadCount: number }>('/api/applications/trainer/notifications');
  }

  markTrainerNotificationRead(id: string): Observable<{ data: { id: string; readAt: string } }> {
    return this.http.patch<{ data: { id: string; readAt: string } }>(`/api/applications/trainer/notifications/${id}/read`, {});
  }

  rateTrainerProject(applicationId: string, input: { rating: number; review: string | null }): Observable<{ data: ApplicationView }> {
    return this.http.patch<{ data: ApplicationView }>(`/api/applications/${applicationId}/review`, input);
  }

  scheduleApplicationInterview(applicationId: string, input: InterviewScheduleInput): Observable<{ data: ApplicationView }> {
    return this.http.patch<{ data: ApplicationView }>(`/api/applications/${applicationId}/interview`, input);
  }

  bookDemoSlot(applicationId: string, input: BookDemoSlotInput): Observable<{ data: ApplicationView }> {
    return this.http.patch<{ data: ApplicationView }>(`/api/applications/${applicationId}/demo-slot`, input);
  }

  decideApplication(applicationId: string, input: ApplicationDecision): Observable<{ data: ApplicationView }> {
    return this.http.patch<{ data: ApplicationView }>(`/api/applications/${applicationId}/decision`, input);
  }

  extractRequirement(input: SmartExtractionRequest): Observable<{ data: SmartExtractionResult }> {
    return this.http.post<{ data: SmartExtractionResult }>('/api/requirements/extract', input);
  }

  extractRequirementImage(file: File): Observable<{ data: SmartExtractionResult }> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<{ data: SmartExtractionResult }>('/api/requirements/extract-image', body);
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

  updateInbox(id: string, extracted: Partial<ExtractedRequirement>): Observable<{ data: InboxItemView }> {
    return this.http.patch<{ data: InboxItemView }>(`/api/inbox/${id}`, { extracted });
  }

  retryInbox(id: string): Observable<{ data: InboxItemView }> {
    return this.http.post<{ data: InboxItemView }>(`/api/inbox/${id}/retry`, {});
  }

  convertInbox(id: string, input: { requirement: RequirementInput; publish: boolean }): Observable<{ data: { id: string; inboxItem: InboxItemView } }> {
    return this.http.post<{ data: { id: string; inboxItem: InboxItemView } }>(`/api/inbox/${id}/convert`, input);
  }

  addSource(id: string, input: SourceInput): Observable<{ data: { id: string } }> {
    return this.http.post<{ data: { id: string } }>(`/api/requirements/${id}/sources`, input);
  }

  updateSource(id: string, sourceId: string, input: Partial<SourceInput>): Observable<{ data: { id: string } }> {
    return this.http.patch<{ data: { id: string } }>(`/api/requirements/${id}/sources/${sourceId}`, input);
  }

  removeSource(id: string, sourceId: string): Observable<void> {
    return this.http.delete<void>(`/api/requirements/${id}/sources/${sourceId}`);
  }

  ungroupRequirement(id: string): Observable<void> {
    return this.http.delete<void>(`/api/requirements/${id}/group`);
  }
}
