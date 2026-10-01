/**
 * Offline-first Synchronization Engine.
 * Implements docs/DESIGN.md section 6 and SRS 3.4 (FR-SYN-1 to FR-SYN-10).
 * Contains NO React imports. Takes API client and Database as injectable dependencies.
 */

import { api, ApiError, NetworkError, type PutReportPayload, type ReportFilterParams } from './api';
import { db, IssueTrackerDatabase } from './db';
import { generateUUID } from './store';
import {
  Role,
  Status,
  SyncState,
  type Report,
  type ReportEvent,
} from './types';

export interface SyncApiClient {
  putReport(id: string, payload: PutReportPayload): Promise<Report>;
  getReports(params?: ReportFilterParams): Promise<Report[]>;
}

export function calculateBackoffMs(attemptCount: number): number {
  // Base exponential backoff: 2s, 4s, 8s, 16s, 32s, max 60s
  const baseSeconds = Math.min(60, 2 * Math.pow(2, Math.max(0, attemptCount - 1)));
  // Random jitter between 0 and 1000ms
  const jitterMs = Math.floor(Math.random() * 1000);
  return baseSeconds * 1000 + jitterMs;
}

export class SyncEngine {
  private isSyncing = false;
  private timerId: any = null;
  private onlineListener: (() => void) | null = null;

  constructor(
    private readonly apiClient: SyncApiClient = api,
    private readonly database: IssueTrackerDatabase = db
  ) {}

  /**
   * Run a single synchronization cycle.
   * Single-flight concurrency control (FR-SYN-10).
   * @param force If true (e.g. manual sync), bypasses next_retry_at backoff timer.
   */
  async syncOnce(force = false): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.locks &&
        typeof navigator.locks.request === 'function'
      ) {
        await navigator.locks.request(
          'offline-issue-tracker-sync',
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              return;
            }
            await this.runSync(force);
          }
        );
      } else {
        await this.runSync(force);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  private async runSync(force: boolean): Promise<void> {
    // 1. Select Submitted reports that are pending
    const allPending = await this.database.reports
      .where('status')
      .equals(Status.SUBMITTED)
      .filter((r) => r.sync_state === SyncState.PENDING)
      .toArray();

    const now = Date.now();
    const candidates = allPending.filter((r) => {
      if (force) return true;
      if (!r.next_retry_at) return true;
      return new Date(r.next_retry_at).getTime() <= now;
    });

    // 2. Process each candidate report sequentially
    for (const report of candidates) {
      await this.syncReport(report);
    }

    // 3. Refresh statuses of synchronized reports from server
    await this.refreshSynchronizedStatuses();
  }

  private async syncReport(report: Report): Promise<void> {
    // Retrieve undelivered events in time order
    const undeliveredEvents = await this.database.events
      .where('report_id')
      .equals(report.id)
      .filter((e) => !e.delivered)
      .sortBy('occurred_at');

    const payload: PutReportPayload = {
      id: report.id,
      category: report.category,
      description: report.description,
      location_text: report.location_text,
      latitude: report.latitude,
      longitude: report.longitude,
      priority: report.priority,
      status: report.status,
      reporter_name: report.reporter_name,
      reported_at: report.reported_at,
      client_events: undeliveredEvents.map((e) => ({
        id: e.id,
        type: e.type,
        actor_role: e.actor_role,
        occurred_at: e.occurred_at,
        details: e.details,
      })),
    };

    try {
      // Send PUT request to central server
      const serverReport = await this.apiClient.putReport(report.id, payload);

      // 200/201: In ONE Dexie transaction: mark synchronized, store server fields,
      // mark events delivered, clear last_error. Only now is report marked delivered (FR-SYN-6).
      await this.database.transaction('rw', this.database.reports, this.database.events, async () => {
        const current = await this.database.reports.get(report.id);
        if (current) {
          const updated: Report = {
            ...current,
            sync_state: SyncState.SYNCHRONIZED,
            received_at: serverReport.received_at || current.received_at,
            updated_at: serverReport.updated_at || current.updated_at,
            status: serverReport.status || current.status,
            last_error: null,
            attempt_count: 0,
            next_retry_at: null,
            updated_locally_at: new Date().toISOString(),
          };
          await this.database.reports.put(updated);
        }

        for (const evt of undeliveredEvents) {
          await this.database.events.update(evt.id, { delivered: true });
        }
      });
    } catch (err: any) {
      await this.handleSyncError(report, err);
    }
  }

  private async handleSyncError(report: Report, err: any): Promise<void> {
    if (err instanceof ApiError) {
      if (err.status === 422) {
        // 422: mark failed with field messages; no automatic retry (FR-SYN-7)
        let message = err.message || 'Validation error';
        if (err.fields && Object.keys(err.fields).length > 0) {
          message = Object.entries(err.fields)
            .map(([field, msg]) => `${field}: ${msg}`)
            .join('; ');
        }
        await this.database.reports.update(report.id, {
          sync_state: SyncState.FAILED,
          last_error: message,
          next_retry_at: null,
          updated_locally_at: new Date().toISOString(),
        });
        return;
      }

      if (err.status === 409 || err.code === 'ID_CONTENT_MISMATCH') {
        // 409 ID_CONTENT_MISMATCH: mark failed with explanatory message
        await this.database.reports.update(report.id, {
          sync_state: SyncState.FAILED,
          last_error: err.message || 'Report ID conflict with different content on server (ID_CONTENT_MISMATCH)',
          next_retry_at: null,
          updated_locally_at: new Date().toISOString(),
        });
        return;
      }
    }

    // Network error, timeout, 5xx or unhandled error:
    // Remain pending, record sync_attempt_failed event, increment attempt_count, set next_retry_at with backoff
    const errorMessage =
      err instanceof NetworkError || err instanceof ApiError
        ? err.message
        : err?.message || 'Network error or server unreachable';

    const newAttemptCount = (report.attempt_count || 0) + 1;
    const backoffMs = calculateBackoffMs(newAttemptCount);
    const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

    const failedEvent: ReportEvent = {
      id: generateUUID(),
      report_id: report.id,
      type: 'sync_attempt_failed',
      actor_role: Role.FIELD_WORKER,
      occurred_at: new Date().toISOString(),
      delivered: false,
      details: {
        error: errorMessage,
        attempt: newAttemptCount,
      },
    };

    await this.database.transaction('rw', this.database.reports, this.database.events, async () => {
      await this.database.reports.update(report.id, {
        sync_state: SyncState.PENDING,
        last_error: errorMessage,
        attempt_count: newAttemptCount,
        next_retry_at: nextRetryAt,
        updated_locally_at: new Date().toISOString(),
      });
      await this.database.events.add(failedEvent);
    });
  }

  /**
   * Reset a failed report back to pending and immediately trigger sync.
   */
  async retryFailed(id: string): Promise<void> {
    const report = await this.database.reports.get(id);
    if (!report) return;

    if (report.sync_state === SyncState.FAILED) {
      await this.database.reports.update(id, {
        sync_state: SyncState.PENDING,
        last_error: null,
        next_retry_at: null,
        attempt_count: 0,
        updated_locally_at: new Date().toISOString(),
      });
      await this.syncOnce(true);
    }
  }

  /**
   * After sending, refresh statuses of synchronized reports from server (FR-SYN-9).
   */
  private async refreshSynchronizedStatuses(): Promise<void> {
    try {
      const syncedReports = await this.database.reports
        .where('sync_state')
        .equals(SyncState.SYNCHRONIZED)
        .toArray();

      if (syncedReports.length === 0) return;

      const ids = syncedReports.map((r) => r.id);
      const serverReports = await this.apiClient.getReports({ ids });

      await this.database.transaction('rw', this.database.reports, async () => {
        for (const serverRep of serverReports) {
          const local = await this.database.reports.get(serverRep.id);
          if (local && local.sync_state === SyncState.SYNCHRONIZED) {
            if (local.status !== serverRep.status || local.updated_at !== serverRep.updated_at) {
              await this.database.reports.update(serverRep.id, {
                status: serverRep.status,
                updated_at: serverRep.updated_at || local.updated_at,
                updated_locally_at: new Date().toISOString(),
              });
            }
          }
        }
      });
    } catch {
      // Non-fatal: failures in status polling do not invalidate synced reports
    }
  }

  /**
   * Start automatic synchronization triggers:
   * 1. Window 'online' event listener
   * 2. Initial sync run
   * 3. 30-second interval check while any reports are pending
   */
  start(): void {
    if (this.onlineListener) return; // already running

    if (typeof window !== 'undefined') {
      this.onlineListener = () => {
        this.syncOnce();
      };
      window.addEventListener('online', this.onlineListener);
    }

    // Initial sync attempt
    this.syncOnce();

    // 30-second interval while anything is pending
    this.timerId = setInterval(async () => {
      try {
        const pendingCount = await this.database.reports
          .where('sync_state')
          .equals(SyncState.PENDING)
          .count();

        if (pendingCount > 0) {
          await this.syncOnce();
        }
      } catch {
        // ignore background interval errors
      }
    }, 30000);
  }

  /**
   * Manual user-initiated sync trigger.
   */
  async syncNow(): Promise<void> {
    return this.syncOnce(true);
  }

  /**
   * Stop background timers and event listeners for cleanup.
   */
  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.onlineListener && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineListener);
      this.onlineListener = null;
    }
  }
}

export const syncEngine = new SyncEngine();
