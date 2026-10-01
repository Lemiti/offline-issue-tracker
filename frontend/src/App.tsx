import { useEffect, useState } from 'react';
import { CoordinatorView } from './components/CoordinatorView';
import { ReportDetailModal } from './components/ReportDetailModal';
import { ReportForm } from './components/ReportForm';
import { ReportList } from './components/ReportList';
import { db } from './db';
import { listReports } from './store';
import { syncEngine } from './syncEngine';
import { Role, SyncState, type Report } from './types';

export function App() {
  const [role, setRole] = useState<Role>(Role.FIELD_WORKER);
  const [reports, setReports] = useState<Report[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const loadLocalData = async () => {
    try {
      const allReports = await listReports();
      setReports(allReports);

      const count = await db.reports
        .where('sync_state')
        .equals(SyncState.PENDING)
        .count();
      setPendingCount(count);

      // If a report is currently opened in detail view, update its reference
      setSelectedReport((prev) => {
        if (!prev) return null;
        const updated = allReports.find((r) => r.id === prev.id);
        return updated || prev;
      });
    } catch (err) {
      console.error('Failed to load local reports from IndexedDB:', err);
    }
  };

  useEffect(() => {
    // 1. Initial data load
    loadLocalData();

    // 2. Start syncEngine background triggers (timer + online listener)
    syncEngine.start();

    // 3. Online/offline window event listeners
    const handleOnline = () => {
      setIsOnline(true);
      loadLocalData();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    // 4. Polling interval to keep pending count and local sync states fresh in UI
    const interval = setInterval(() => {
      loadLocalData();
    }, 4000);

    return () => {
      syncEngine.stop();
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await syncEngine.syncNow();
    } finally {
      setIsSyncing(false);
      await loadLocalData();
    }
  };

  const handleRetryFailed = async (id: string) => {
    setIsSyncing(true);
    try {
      await syncEngine.retryFailed(id);
    } finally {
      setIsSyncing(false);
      await loadLocalData();
    }
  };

  return (
    <div
      style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: '1.25rem',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#1a1a1a',
        backgroundColor: '#ffffff',
      }}
    >
      {/* Header with App Info, Online Status, Pending Count, Sync button, and Role selector */}
      <header
        style={{
          borderBottom: '2px solid #e8e8e8',
          paddingBottom: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', color: '#111' }}>
              Offline Field Issue Tracker
            </h1>
            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.2rem' }}>
              Reliable offline reporting with idempotent synchronization
            </div>
          </div>

          {/* Status Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Online/Offline indicator (text + icon, accessible) */}
            <span
              role="status"
              aria-label={`Connectivity status: ${isOnline ? 'Online' : 'Offline'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '4px',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                backgroundColor: isOnline ? '#f6ffed' : '#fff1f0',
                color: isOnline ? '#389e0d' : '#cf1322',
                border: `1px solid ${isOnline ? '#b7eb8f' : '#ffa39e'}`,
              }}
            >
              <span aria-hidden="true">{isOnline ? '🟢' : '🔴'}</span>
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </span>

            {/* Pending reports count */}
            <span
              role="status"
              aria-label={`${pendingCount} reports pending synchronization`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '4px',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                backgroundColor: pendingCount > 0 ? '#fff7e6' : '#fafafa',
                color: pendingCount > 0 ? '#d46b08' : '#666',
                border: `1px solid ${pendingCount > 0 ? '#ffd591' : '#d9d9d9'}`,
              }}
            >
              <span aria-hidden="true">⏳</span>
              <span>Pending Sync: {pendingCount}</span>
            </span>

            {/* Sync Now button */}
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing}
              style={{
                padding: '0.35rem 0.85rem',
                backgroundColor: isSyncing ? '#d9d9d9' : '#0958d9',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '0.85rem',
              }}
            >
              {isSyncing ? 'Syncing...' : 'Sync now'}
            </button>

            {/* Role Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
              <label htmlFor="role-switcher" style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                Role:
              </label>
              <select
                id="role-switcher"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                style={{
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.85rem',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                }}
              >
                <option value={Role.FIELD_WORKER}>Field Worker</option>
                <option value={Role.COORDINATOR}>Coordinator</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main>
        {role === Role.FIELD_WORKER ? (
          <div>
            <ReportForm onReportSaved={loadLocalData} />
            <ReportList
              reports={reports}
              role={role}
              onReportUpdated={loadLocalData}
              onSelectReport={(r) => setSelectedReport(r)}
              onRetryFailed={handleRetryFailed}
            />
          </div>
        ) : (
          <div>
            <CoordinatorView
              isOnline={isOnline}
              onSelectReport={(r) => setSelectedReport(r)}
            />
          </div>
        )}
      </main>

      {/* Report Detail Modal */}
      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          isOnline={isOnline}
          onClose={() => setSelectedReport(null)}
          onRetry={handleRetryFailed}
        />
      )}
    </div>
  );
}

export default App;
