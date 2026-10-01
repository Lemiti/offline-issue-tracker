import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError, NetworkError, type PutReportPayload, type ReportFilterParams } from '../api';
import { IssueTrackerDatabase } from '../db';
import { createAndSubmitReport, getReportEvents } from '../store';
import { SyncApiClient, SyncEngine } from '../syncEngine';
import { Category, Priority, Role, Status, SyncState, type Report } from '../types';

class FakeApiClient implements SyncApiClient {
  serverReports = new Map<string, Report>();
  putCalls: Array<{ id: string; payload: PutReportPayload }> = [];
  getCalls: Array<ReportFilterParams | undefined> = [];

  putHandler?: (id: string, payload: PutReportPayload) => Promise<Report>;
  getHandler?: (params?: ReportFilterParams) => Promise<Report[]>;

  async putReport(id: string, payload: PutReportPayload): Promise<Report> {
    this.putCalls.push({ id, payload });
    if (this.putHandler) {
      return this.putHandler(id, payload);
    }

    const now = new Date().toISOString();
    const existing = this.serverReports.get(id);
    if (existing) {
      return existing; // 200 with existing content
    }

    const stored: Report = {
      id,
      category: payload.category as any,
      description: payload.description,
      location_text: payload.location_text,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      priority: payload.priority as any,
      status: payload.status || Status.SUBMITTED,
      reporter_name: payload.reporter_name ?? null,
      reported_at: payload.reported_at,
      received_at: now,
      updated_at: now,
      sync_state: SyncState.SYNCHRONIZED,
      last_error: null,
      attempt_count: 0,
      next_retry_at: null,
      updated_locally_at: now,
    };
    this.serverReports.set(id, stored);
    return stored;
  }

  async getReports(params?: ReportFilterParams): Promise<Report[]> {
    this.getCalls.push(params);
    if (this.getHandler) {
      return this.getHandler(params);
    }
    let reports = Array.from(this.serverReports.values());
    if (params?.ids) {
      const idList = Array.isArray(params.ids) ? params.ids : params.ids.split(',');
      reports = reports.filter((r) => idList.includes(r.id));
    }
    return reports;
  }
}

describe('SyncEngine (syncEngine.ts)', () => {
  let dbName: string;
  let testDb: IssueTrackerDatabase;
  let fakeApi: FakeApiClient;
  let engine: SyncEngine;

  beforeEach(async () => {
    dbName = `SyncEngineTestDB_${Date.now()}_${Math.random()}`;
    testDb = new IssueTrackerDatabase(dbName);
    await testDb.open();
    fakeApi = new FakeApiClient();
    engine = new SyncEngine(fakeApi, testDb);
  });

  // 1. success marks synchronized and delivers events once
  it('1. success marks synchronized and delivers events once', async () => {
    const report = await createAndSubmitReport(
      {
        category: Category.WATER_POINT,
        description: 'Borehole pump handle broken and leaking.',
        location_text: 'District 4 North',
        priority: Priority.HIGH,
      },
      testDb
    );

    const initialEvents = await getReportEvents(report.id, testDb);
    expect(initialEvents.every((e) => !e.delivered)).toBe(true);

    await engine.syncOnce();

    // Check report status and sync_state in IndexedDB
    const syncedReport = await testDb.reports.get(report.id);
    expect(syncedReport).toBeDefined();
    expect(syncedReport?.sync_state).toBe(SyncState.SYNCHRONIZED);
    expect(syncedReport?.received_at).toBeDefined();
    expect(syncedReport?.last_error).toBeNull();
    expect(syncedReport?.attempt_count).toBe(0);

    // Verify all local events are now marked delivered
    const updatedEvents = await getReportEvents(report.id, testDb);
    expect(updatedEvents).toHaveLength(2); // created + submitted
    expect(updatedEvents.every((e) => e.delivered)).toBe(true);

    // Running syncOnce again should not re-send already synchronized report
    await engine.syncOnce();
    expect(fakeApi.putCalls).toHaveLength(1);
  });

  // 2. network error keeps pending, data intact, attempt_count incremented, backoff set
  it('2. network error keeps pending, data intact, attempt_count incremented, backoff set', async () => {
    const report = await createAndSubmitReport(
      {
        category: Category.EQUIPMENT_DAMAGE,
        description: 'Solar panel array frame bent by wind storm.',
        location_text: 'Clinic roof station',
        priority: Priority.MEDIUM,
      },
      testDb
    );

    fakeApi.putHandler = async () => {
      throw new NetworkError('Connection timed out');
    };

    const beforeSyncTime = Date.now();
    await engine.syncOnce();

    const storedReport = await testDb.reports.get(report.id);
    expect(storedReport).toBeDefined();
    expect(storedReport?.sync_state).toBe(SyncState.PENDING);
    // Data remains intact
    expect(storedReport?.description).toBe('Solar panel array frame bent by wind storm.');
    expect(storedReport?.location_text).toBe('Clinic roof station');
    expect(storedReport?.attempt_count).toBe(1);
    expect(storedReport?.last_error).toBe('Connection timed out');

    // Backoff set in the future
    expect(storedReport?.next_retry_at).toBeDefined();
    const nextRetryMs = new Date(storedReport!.next_retry_at!).getTime();
    expect(nextRetryMs).toBeGreaterThanOrEqual(beforeSyncTime + 2000);

    // Local sync_attempt_failed event recorded
    const events = await getReportEvents(report.id, testDb);
    const failedEvent = events.find((e) => e.type === 'sync_attempt_failed');
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.delivered).toBe(false);
    expect(failedEvent?.details?.attempt).toBe(1);
  });

  // 3. SERVER SAVED BUT RESPONSE LOST: first call throws a network error, the fake server has the record;
  // retry gets 200 and the report becomes synchronized with exactly one server record
  it('3. SERVER SAVED BUT RESPONSE LOST: retry gets 200 and report synchronizes with one server record', async () => {
    const report = await createAndSubmitReport(
      {
        category: Category.SAFETY_CONCERN,
        description: 'Exposed high voltage wire near water storage tank.',
        location_text: 'Main pumping facility',
        priority: Priority.CRITICAL,
      },
      testDb
    );

    // Attempt 1: Server commits the record, but network drops before response reaches device
    fakeApi.putHandler = async (id, payload) => {
      const now = new Date().toISOString();
      const saved: Report = {
        id,
        category: payload.category as any,
        description: payload.description,
        location_text: payload.location_text,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        priority: payload.priority as any,
        status: Status.SUBMITTED,
        reporter_name: null,
        reported_at: payload.reported_at,
        received_at: now,
        updated_at: now,
        sync_state: SyncState.SYNCHRONIZED,
        last_error: null,
        attempt_count: 0,
        next_retry_at: null,
        updated_locally_at: now,
      };
      fakeApi.serverReports.set(id, saved);
      throw new NetworkError('Connection dropped after commit');
    };

    await engine.syncOnce();

    // Client side: response was lost, so report is still pending
    const clientAfterLost = await testDb.reports.get(report.id);
    expect(clientAfterLost?.sync_state).toBe(SyncState.PENDING);
    // Server side: record exists
    expect(fakeApi.serverReports.has(report.id)).toBe(true);
    expect(fakeApi.serverReports.size).toBe(1);

    // Attempt 2: Connectivity restored, retry is sent
    fakeApi.putHandler = undefined; // revert to default server behavior (returns existing record 200)

    await engine.syncOnce(true);

    // Client side: now synchronized
    const clientAfterRetry = await testDb.reports.get(report.id);
    expect(clientAfterRetry?.sync_state).toBe(SyncState.SYNCHRONIZED);

    // Server side: STILL exactly one record
    expect(fakeApi.serverReports.size).toBe(1);
    expect(fakeApi.serverReports.get(report.id)?.id).toBe(report.id);
  });

  // 4. 422 marks failed with reason and is not retried automatically
  it('4. 422 marks failed with reason and is not retried automatically', async () => {
    const report = await createAndSubmitReport(
      {
        category: Category.MAINTENANCE,
        description: 'Broken gate hinge.',
        location_text: 'Community depot',
        priority: Priority.LOW,
      },
      testDb
    );

    fakeApi.putHandler = async () => {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', {
        description: 'Description must be at least 10 characters long.',
      });
    };

    await engine.syncOnce();

    const failedReport = await testDb.reports.get(report.id);
    expect(failedReport?.sync_state).toBe(SyncState.FAILED);
    expect(failedReport?.last_error).toContain('Description must be at least 10 characters long');
    expect(failedReport?.next_retry_at).toBeNull();

    // Subsequent syncOnce should NOT retry automatically
    await engine.syncOnce();
    expect(fakeApi.putCalls).toHaveLength(1);

    // Manual retry via retryFailed(id) resets and retries
    fakeApi.putHandler = undefined; // allow success
    await engine.retryFailed(report.id);

    const retriedReport = await testDb.reports.get(report.id);
    expect(retriedReport?.sync_state).toBe(SyncState.SYNCHRONIZED);
    expect(fakeApi.putCalls).toHaveLength(2);
  });

  // 5. concurrent syncOnce() calls result in a single run
  it('5. concurrent syncOnce() calls result in a single run', async () => {
    await createAndSubmitReport(
      {
        category: Category.WATER_POINT,
        description: 'Water tap leaking heavily outside school gate.',
        location_text: 'Primary school entrance',
        priority: Priority.MEDIUM,
      },
      testDb
    );

    let inFlightCount = 0;
    let maxConcurrent = 0;

    fakeApi.putHandler = async (id, payload) => {
      inFlightCount++;
      maxConcurrent = Math.max(maxConcurrent, inFlightCount);
      await new Promise((r) => setTimeout(r, 40));
      inFlightCount--;
      return {
        id,
        category: payload.category as any,
        description: payload.description,
        location_text: payload.location_text,
        latitude: null,
        longitude: null,
        priority: payload.priority as any,
        status: Status.SUBMITTED,
        reporter_name: null,
        reported_at: payload.reported_at,
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sync_state: SyncState.SYNCHRONIZED,
        last_error: null,
        attempt_count: 0,
        next_retry_at: null,
        updated_locally_at: new Date().toISOString(),
      };
    };

    // Invoke 3 syncOnce calls concurrently
    await Promise.all([engine.syncOnce(), engine.syncOnce(), engine.syncOnce()]);

    expect(maxConcurrent).toBe(1);
    expect(fakeApi.putCalls).toHaveLength(1);
  });

  // 6. a report is never marked synchronized before the response is processed
  it('6. a report is never marked synchronized before the response is processed', async () => {
    const report = await createAndSubmitReport(
      {
        category: Category.SERVICE_INTERRUPTION,
        description: 'Power cut at distribution sub-station #5.',
        location_text: 'Sector 5 distribution hub',
        priority: Priority.HIGH,
      },
      testDb
    );

    let stateDuringNetworkCall: SyncState | undefined;

    fakeApi.putHandler = async (id, payload) => {
      // Check status in DB while the network call is actively in flight
      const currentInDb = await testDb.reports.get(id);
      stateDuringNetworkCall = currentInDb?.sync_state;

      await new Promise((r) => setTimeout(r, 20));

      return {
        id,
        category: payload.category as any,
        description: payload.description,
        location_text: payload.location_text,
        latitude: null,
        longitude: null,
        priority: payload.priority as any,
        status: Status.SUBMITTED,
        reporter_name: null,
        reported_at: payload.reported_at,
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sync_state: SyncState.SYNCHRONIZED,
        last_error: null,
        attempt_count: 0,
        next_retry_at: null,
        updated_locally_at: new Date().toISOString(),
      };
    };

    await engine.syncOnce();

    // In-flight state was strictly PENDING
    expect(stateDuringNetworkCall).toBe(SyncState.PENDING);

    // Final state is SYNCHRONIZED
    const finalReport = await testDb.reports.get(report.id);
    expect(finalReport?.sync_state).toBe(SyncState.SYNCHRONIZED);
  });

  // 7. app restart (new engine instance, same database) resends pending reports
  it('7. app restart (new engine instance, same database) resends pending reports', async () => {
    const report = await createAndSubmitReport(
      {
        category: Category.WATER_POINT,
        description: 'Underground pipeline cracked and seeping into street.',
        location_text: 'Corner of 5th Ave and Maple',
        priority: Priority.HIGH,
      },
      testDb
    );

    // Stop and discard initial engine instance
    engine.stop();

    // Verify report is pending in testDb
    const pendingBeforeRestart = await testDb.reports.get(report.id);
    expect(pendingBeforeRestart?.sync_state).toBe(SyncState.PENDING);

    // Create a brand new SyncEngine instance simulating application restart
    const restartedEngine = new SyncEngine(fakeApi, testDb);

    await restartedEngine.syncOnce();

    // The pending report was picked up and synchronized
    const syncedAfterRestart = await testDb.reports.get(report.id);
    expect(syncedAfterRestart?.sync_state).toBe(SyncState.SYNCHRONIZED);
    expect(fakeApi.putCalls).toHaveLength(1);
    expect(fakeApi.putCalls[0].id).toBe(report.id);
  });
});
