export type SupportStatus = 'Provided' | 'Reimbursed' | 'Not provided' | 'Unknown';

export interface SupportItem {
  label: 'Travel' | 'Food' | 'Stay';
  status: SupportStatus;
}

export interface Requirement {
  id: string;
  title: string;
  stack: string[];
  dateLabel: string;
  durationDays: number;
  city: string;
  audience: string;
  tfa: SupportStatus;
  paymentDate: string | null;
  postingCount: number;
  groupCount: number;
  sources: string[];
  support: SupportItem[];
}

export interface InboxPost {
  id: string;
  source: string;
  sourceInitial: string;
  receivedAt: string;
  group: string;
  text: string;
}