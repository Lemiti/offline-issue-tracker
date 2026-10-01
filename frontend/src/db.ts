/**
 * Local IndexedDB database using Dexie.
 * Implements data storage for offline operation as specified in docs/DESIGN.md section 3.2.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Report, ReportEvent } from './types';

export class IssueTrackerDatabase extends Dexie {
  reports!: EntityTable<Report, 'id'>;
  events!: EntityTable<ReportEvent, 'id'>;

  constructor(dbName = 'IssueTrackerDB') {
    super(dbName);
    this.version(1).stores({
      reports: 'id, status, sync_state, updated_locally_at',
      events: 'id, report_id, delivered, occurred_at',
    });
  }
}

export const db = new IssueTrackerDatabase();
