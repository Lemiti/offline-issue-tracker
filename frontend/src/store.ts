/**
 * Local report storage and workflow operations using IndexedDB (Dexie).
 * Contains NO React imports as specified in project rules.
 * Implements requirements from docs/DESIGN.md section 3.2 and docs/SRS.md 3.1-3.3.
 */

import { db, IssueTrackerDatabase } from './db';
import {
  Role,
  Status,
  SyncState,
  type Report,
  type ReportEvent,
  type ReportInput,
} from './types';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a new report in Draft status stored locally in IndexedDB.
 * Writes a local 'created' event with its own UUID (FR-HIS-1, FR-HIS-5).
 */
export async function createDraft(
  input: ReportInput,
  dbInstance: IssueTrackerDatabase = db
): Promise<Report> {
  const now = new Date().toISOString();
  const id = generateUUID();

  const report: Report = {
    id,
    category: input.category,
    description: input.description,
    location_text: input.location_text,
    latitude:
      input.latitude !== undefined && input.latitude !== null && input.latitude !== ('' as any)
        ? Number(input.latitude)
        : null,
    longitude:
      input.longitude !== undefined && input.longitude !== null && input.longitude !== ('' as any)
        ? Number(input.longitude)
        : null,
    priority: input.priority,
    status: Status.DRAFT,
    reporter_name: input.reporter_name?.trim() || null,
    reported_at: input.reported_at || now,
    sync_state: SyncState.PENDING,
    last_error: null,
    attempt_count: 0,
    next_retry_at: null,
    updated_locally_at: now,
  };

  const createdEvent: ReportEvent = {
    id: generateUUID(),
    report_id: id,
    type: 'created',
    actor_role: Role.FIELD_WORKER,
    occurred_at: now,
    delivered: false,
    details: { action: 'draft_created' },
  };

  await dbInstance.transaction('rw', dbInstance.reports, dbInstance.events, async () => {
    await dbInstance.reports.add(report);
    await dbInstance.events.add(createdEvent);
  });

  return report;
}

/**
 * Update an existing Draft report.
 * Submitted and later reports are strictly read-only for field edits (SRS A-4, FR-SYN-9).
 */
export async function updateDraft(
  id: string,
  updates: Partial<ReportInput>,
  dbInstance: IssueTrackerDatabase = db
): Promise<Report> {
  const existing = await dbInstance.reports.get(id);
  if (!existing) {
    throw new Error(`Report '${id}' not found.`);
  }

  if (existing.status !== Status.DRAFT) {
    throw new Error('Submitted reports are read-only and cannot be edited.');
  }

  const now = new Date().toISOString();
  const updatedReport: Report = {
    ...existing,
    category: updates.category ?? existing.category,
    description: updates.description ?? existing.description,
    location_text: updates.location_text ?? existing.location_text,
    latitude:
      updates.latitude !== undefined
        ? updates.latitude !== null && updates.latitude !== ('' as any)
          ? Number(updates.latitude)
          : null
        : existing.latitude,
    longitude:
      updates.longitude !== undefined
        ? updates.longitude !== null && updates.longitude !== ('' as any)
          ? Number(updates.longitude)
          : null
        : existing.longitude,
    priority: updates.priority ?? existing.priority,
    reporter_name:
      updates.reporter_name !== undefined
        ? updates.reporter_name?.trim() || null
        : existing.reporter_name,
    reported_at: updates.reported_at ?? existing.reported_at,
    updated_locally_at: now,
  };

  await dbInstance.reports.put(updatedReport);
  return updatedReport;
}

/**
 * Submit a Draft report: transitions status from Draft to Submitted,
 * keeps sync_state as pending, and records local 'submitted' event with its own UUID.
 */
export async function submitReport(
  id: string,
  dbInstance: IssueTrackerDatabase = db
): Promise<Report> {
  const existing = await dbInstance.reports.get(id);
  if (!existing) {
    throw new Error(`Report '${id}' not found.`);
  }

  if (existing.status !== Status.DRAFT) {
    throw new Error(
      `Cannot submit report in '${existing.status}' status. Only Drafts can be submitted.`
    );
  }

  const now = new Date().toISOString();

  // Check if a 'created' event already exists for this report
  const existingCreatedEvent = await dbInstance.events
    .where('report_id')
    .equals(id)
    .filter((e) => e.type === 'created')
    .first();

  const submittedEvent: ReportEvent = {
    id: generateUUID(),
    report_id: id,
    type: 'submitted',
    actor_role: Role.FIELD_WORKER,
    occurred_at: now,
    delivered: false,
    details: { action: 'report_submitted' },
  };

  const updatedReport: Report = {
    ...existing,
    status: Status.SUBMITTED,
    sync_state: SyncState.PENDING,
    updated_locally_at: now,
  };

  await dbInstance.transaction('rw', dbInstance.reports, dbInstance.events, async () => {
    if (!existingCreatedEvent) {
      await dbInstance.events.add({
        id: generateUUID(),
        report_id: id,
        type: 'created',
        actor_role: Role.FIELD_WORKER,
        occurred_at: existing.reported_at || now,
        delivered: false,
        details: { action: 'draft_created' },
      });
    }
    await dbInstance.events.add(submittedEvent);
    await dbInstance.reports.put(updatedReport);
  });

  return updatedReport;
}

/**
 * Convenience helper to create a report and submit it in one user action.
 * Writes both 'created' and 'submitted' events with their own UUIDs.
 */
export async function createAndSubmitReport(
  input: ReportInput,
  dbInstance: IssueTrackerDatabase = db
): Promise<Report> {
  const draft = await createDraft(input, dbInstance);
  return submitReport(draft.id, dbInstance);
}

/**
 * List all locally stored reports ordered newest first by updated_locally_at.
 */
export async function listReports(dbInstance: IssueTrackerDatabase = db): Promise<Report[]> {
  return dbInstance.reports.orderBy('updated_locally_at').reverse().toArray();
}

/**
 * Retrieve a single report by ID.
 */
export async function getReport(
  id: string,
  dbInstance: IssueTrackerDatabase = db
): Promise<Report | undefined> {
  return dbInstance.reports.get(id);
}

/**
 * Retrieve all local events for a given report in time order.
 */
export async function getReportEvents(
  reportId: string,
  dbInstance: IssueTrackerDatabase = db
): Promise<ReportEvent[]> {
  return dbInstance.events
    .where('report_id')
    .equals(reportId)
    .sortBy('occurred_at');
}
