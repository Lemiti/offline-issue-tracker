import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IssueTrackerDatabase } from '../db';
import {
  createDraft,
  createAndSubmitReport,
  getReport,
  getReportEvents,
  listReports,
  submitReport,
  updateDraft,
} from '../store';
import { Category, Priority, Role, Status, SyncState } from '../types';

describe('Local Report Store (store.ts)', () => {
  let dbName: string;
  let testDb: IssueTrackerDatabase;

  beforeEach(async () => {
    dbName = `StoreTestDB_${Date.now()}_${Math.random()}`;
    testDb = new IssueTrackerDatabase(dbName);
    await testDb.open();
  });

  it('creates a draft with pending sync_state and local created event', async () => {
    const draft = await createDraft(
      {
        category: Category.WATER_POINT,
        description: 'Broken water tap leaking heavily.',
        location_text: 'Central market area',
        priority: Priority.HIGH,
      },
      testDb
    );

    expect(draft.id).toBeDefined();
    expect(draft.status).toBe(Status.DRAFT);
    expect(draft.sync_state).toBe(SyncState.PENDING);

    // Verify local 'created' event was written with unique UUID
    const events = await getReportEvents(draft.id, testDb);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('created');
    expect(events[0].actor_role).toBe(Role.FIELD_WORKER);
    expect(events[0].delivered).toBe(false);
  });

  it('data survives closing and reopening the database', async () => {
    const draft = await createDraft(
      {
        category: Category.EQUIPMENT_DAMAGE,
        description: 'Solar power box cracked by falling branch.',
        location_text: 'Health dispensary roof',
        priority: Priority.MEDIUM,
      },
      testDb
    );

    // Close the database instance (simulating app close or refresh)
    testDb.close();

    // Reopen a fresh Dexie instance against the same database name
    const reopenedDb = new IssueTrackerDatabase(dbName);
    await reopenedDb.open();

    const retrieved = await getReport(draft.id, reopenedDb);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(draft.id);
    expect(retrieved?.description).toBe('Solar power box cracked by falling branch.');
    expect(retrieved?.status).toBe(Status.DRAFT);

    const events = await getReportEvents(draft.id, reopenedDb);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('created');

    reopenedDb.close();
  });

  it('allows editing draft reports but strictly refuses editing submitted reports', async () => {
    const draft = await createDraft(
      {
        category: Category.MAINTENANCE,
        description: 'Playground gate hinge loose and squeaking.',
        location_text: 'Park entrance',
        priority: Priority.LOW,
      },
      testDb
    );

    // 1. Updating Draft succeeds
    const updated = await updateDraft(
      draft.id,
      { description: 'Playground gate hinge broken completely.' },
      testDb
    );
    expect(updated.description).toBe('Playground gate hinge broken completely.');

    // 2. Submit the report (transitions to Submitted)
    await submitReport(draft.id, testDb);

    // 3. Attempting to edit a Submitted report must be refused
    await expect(
      updateDraft(draft.id, { description: 'Trying to modify after submission' }, testDb)
    ).rejects.toThrow('Submitted reports are read-only and cannot be edited.');
  });

  it('submit writes expected local created and submitted events with their own UUIDs', async () => {
    // Test creating draft then submitting
    const draft = await createDraft(
      {
        category: Category.SAFETY_CONCERN,
        description: 'Exposed live power wire touching metal fence.',
        location_text: 'Near railway crossing',
        priority: Priority.CRITICAL,
      },
      testDb
    );

    const submitted = await submitReport(draft.id, testDb);
    expect(submitted.status).toBe(Status.SUBMITTED);
    expect(submitted.sync_state).toBe(SyncState.PENDING);

    const events = await getReportEvents(draft.id, testDb);
    expect(events).toHaveLength(2);

    const [createdEvent, submittedEvent] = events;
    expect(createdEvent.type).toBe('created');
    expect(submittedEvent.type).toBe('submitted');

    // Both events must have their own unique UUIDs
    expect(createdEvent.id).toBeDefined();
    expect(submittedEvent.id).toBeDefined();
    expect(createdEvent.id).not.toBe(submittedEvent.id);
    expect(createdEvent.delivered).toBe(false);
    expect(submittedEvent.delivered).toBe(false);
  });

  it('createAndSubmitReport records both created and submitted events', async () => {
    const report = await createAndSubmitReport(
      {
        category: Category.SERVICE_INTERRUPTION,
        description: 'Water distribution line valve closed unexpectedly.',
        location_text: 'Valve junction 3',
        priority: Priority.HIGH,
      },
      testDb
    );

    expect(report.status).toBe(Status.SUBMITTED);
    const events = await getReportEvents(report.id, testDb);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.type)).toEqual(['created', 'submitted']);
  });

  it('lists reports ordered newest first', async () => {
    const rep1 = await createDraft(
      {
        category: Category.WATER_POINT,
        description: 'Report 1 description with enough length.',
        location_text: 'Location 1',
        priority: Priority.LOW,
      },
      testDb
    );

    // Delay slightly to ensure distinct timestamp
    await new Promise((r) => setTimeout(r, 10));

    const rep2 = await createDraft(
      {
        category: Category.WATER_POINT,
        description: 'Report 2 description with enough length.',
        location_text: 'Location 2',
        priority: Priority.HIGH,
      },
      testDb
    );

    const reports = await listReports(testDb);
    expect(reports.length).toBeGreaterThanOrEqual(2);
    expect(reports[0].id).toBe(rep2.id);
    expect(reports[1].id).toBe(rep1.id);
  });
});
