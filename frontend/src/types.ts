/**
 * Domain types and enums for the Offline Field Issue Tracker.
 * Mirrors docs/DESIGN.md section 3.2 and docs/SRS.md.
 */

export enum Category {
  WATER_POINT = 'Water point',
  EQUIPMENT_DAMAGE = 'Equipment damage',
  SERVICE_INTERRUPTION = 'Service interruption',
  SAFETY_CONCERN = 'Safety concern',
  MAINTENANCE = 'Maintenance',
}

export enum Priority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

export enum Status {
  DRAFT = 'Draft',
  SUBMITTED = 'Submitted',
  ASSIGNED = 'Assigned',
  IN_PROGRESS = 'In Progress',
  RESOLVED = 'Resolved',
  REJECTED = 'Rejected',
}

export enum SyncState {
  PENDING = 'pending',
  SYNCHRONIZED = 'synchronized',
  FAILED = 'failed',
}

export enum Role {
  FIELD_WORKER = 'field_worker',
  COORDINATOR = 'coordinator',
}

export interface ReportEvent {
  id: string; // UUID primary key
  report_id: string;
  type: string;
  actor_role: string;
  occurred_at: string;
  recorded_at?: string;
  details?: Record<string, any> | null;
  delivered: boolean; // Device-local flag; true once acknowledged by server
}

export interface Report {
  id: string; // UUID primary key
  category: Category | string;
  description: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  priority: Priority | string;
  status: Status | string;
  reporter_name: string | null;
  reported_at: string;
  received_at?: string | null;
  updated_at?: string | null;

  // Local storage & sync fields (DESIGN 3.2)
  sync_state: SyncState;
  last_error: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  updated_locally_at: string;
}

export interface ReportInput {
  category: Category | string;
  description: string;
  location_text: string;
  latitude?: number | null;
  longitude?: number | null;
  priority: Priority | string;
  reporter_name?: string | null;
  reported_at?: string;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  fields: Record<string, string>;
}
