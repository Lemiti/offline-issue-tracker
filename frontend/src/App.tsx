import { useEffect, useState } from 'react';
import { ReportForm } from './components/ReportForm';
import { ReportList } from './components/ReportList';
import { listReports } from './store';
import { Role, type Report } from './types';

export function App() {
  const [role, setRole] = useState<Role>(Role.FIELD_WORKER);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadReports = async () => {
    try {
      const allReports = await listReports();
      setReports(allReports);
    } catch (err) {
      console.error('Failed to load reports from IndexedDB:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#222' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '1rem',
          marginBottom: '1.5rem',
          borderBottom: '2px solid #eee',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Offline Field Issue Tracker</h1>
          <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.25rem' }}>
            Offline-first issue reporting & local persistence
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="role-select" style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
            Current Role:
          </label>
          <select
            id="role-select"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.95rem', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value={Role.FIELD_WORKER}>Field Worker</option>
            <option value={Role.COORDINATOR}>Coordinator</option>
          </select>
        </div>
      </header>

      <main>
        {role === Role.FIELD_WORKER ? (
          <>
            <ReportForm onReportSaved={loadReports} />
            {loading ? <p>Loading local reports...</p> : <ReportList reports={reports} role={role} onReportUpdated={loadReports} />}
          </>
        ) : (
          <>
            <div
              style={{
                backgroundColor: '#e6f7ff',
                border: '1px solid #91d5ff',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1.5rem',
              }}
            >
              <strong>Coordinator View:</strong> Reviewing locally stored reports. Coordinator status transitions and centralized updates require online connectivity to the central server (SRS FR-OFF-5).
            </div>
            {loading ? <p>Loading local reports...</p> : <ReportList reports={reports} role={role} onReportUpdated={loadReports} />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
