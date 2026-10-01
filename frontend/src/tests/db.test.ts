import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IssueTrackerDatabase } from '../db';
import { Category, Priority, type Report, type ReportEvent, Status, SyncState } from '../types';

describe('Local Database (Dexie IndexedDB)', () => {
  let testDb: IssueTrackerDatabase;

  beforeEach(async () => {
    testDb = new IssueTrackerDatabase(`TestDB_${Date.now()}_${Math.random()}`);
    await testDb.open();
  });

  it('stores and retrieves report records with local sync fields', async () => {
    const report: Report = {
      id: 'rep-001',
      category: Category.WATER_POINT,
      description: 'Hand pump handle detached.',
      location_text: 'Well 4',
      latitude: 10.5,
      longitude: 20.5,
      priority: Priority.HIGH,
      status: Status.DRAFT,
      reporter_name: 'John',
      reported_at: new Date().toISOString(),
      sync_state: SyncState.PENDING,
      last_error: null,
      attempt_count: 0,
      next_retry_at: null,
      updated_locally_at: new Date().toISOString(),
    };

    await testDb.reports.add(report);
    const retrieved = await testDb.reports.get('rep-001');

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('rep-001');
    expect(retrieved?.status).toBe(Status.DRAFT);
    expect(retrieved?.sync_state).toBe(SyncState.PENDING);
  });

  it('stores and queries report events by report_id and delivery state', async () => {
    const event: ReportEvent = {
      id: 'ev-001',
      report_id: 'rep-001',
      type: 'created',
      actor_role: 'field_worker',
      occurred_at: new Date().toISOString(),
      delivered: false,
      details: { initial: true },
    };

    await testDb.events.add(event);

    const undelivered = await testDb.events
      .where('report_id')
      .equals('rep-001')
      .filter((e) => !e.delivered)
      .toArray();

    expect(undelivered).toHaveLength(1);
    expect(undelivered[0].id).toBe('ev-001');
    expect(undelivered[0].delivered).toBe(false);
  });
});
