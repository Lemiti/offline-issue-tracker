import { useState } from 'react';
import { getReportEvents, submitReport } from '../store';
import { Role, Status, SyncState, type Report, type ReportEvent } from '../types';

interface ReportListProps {
  reports: Report[];
  role: Role;
  onReportUpdated: () => void;
}

export function ReportList({ reports, role, onReportUpdated }: ReportListProps) {
  const [selectedReportEvents, setSelectedReportEvents] = useState<{
    reportId: string;
    events: ReportEvent[];
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSubmitDraft = async (reportId: string) => {
    setActionError(null);
    try {
      await submitReport(reportId);
      onReportUpdated();
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit draft.');
    }
  };

  const handleToggleEvents = async (reportId: string) => {
    if (selectedReportEvents && selectedReportEvents.reportId === reportId) {
      setSelectedReportEvents(null);
      return;
    }

    try {
      const events = await getReportEvents(reportId);
      setSelectedReportEvents({ reportId, events });
    } catch (err: any) {
      setActionError(err.message || 'Failed to load report events.');
    }
  };

  const renderSyncBadge = (report: Report) => {
    switch (report.sync_state) {
      case SyncState.PENDING:
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              backgroundColor: '#fff7e6',
              border: '1px solid #ffd591',
              color: '#d46b08',
              fontWeight: 'bold',
            }}
          >
            Not synchronized
          </span>
        );
      case SyncState.SYNCHRONIZED:
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              backgroundColor: '#f6ffed',
              border: '1px solid #b7eb8f',
              color: '#389e0d',
              fontWeight: 'bold',
            }}
          >
            Synchronized
          </span>
        );
      case SyncState.FAILED:
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              backgroundColor: '#fff1f0',
              border: '1px solid #ffa39e',
              color: '#cf1322',
              fontWeight: 'bold',
            }}
          >
            Sync Failed{report.last_error ? `: ${report.last_error}` : ''}
          </span>
        );
      default:
        return <span>{report.sync_state}</span>;
    }
  };

  return (
    <section>
      <h2>Field Reports ({reports.length})</h2>

      {actionError && (
        <div style={{ backgroundColor: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', padding: '0.75rem', marginBottom: '1rem', borderRadius: '4px' }}>
          {actionError}
        </div>
      )}

      {reports.length === 0 ? (
        <p style={{ color: '#666' }}>No reports recorded locally yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reports.map((report) => {
            const isEventsOpen = selectedReportEvents?.reportId === report.id;

            return (
              <div
                key={report.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  padding: '1rem',
                  backgroundColor: report.status === Status.DRAFT ? '#fafafa' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{report.category}</span>
                    <span style={{ fontSize: '0.85rem', color: '#555' }}>Priority: <strong>{report.priority}</strong></span>
                    <span style={{ fontSize: '0.85rem', color: '#555' }}>Status: <strong>{report.status}</strong></span>
                  </div>
                  <div>{renderSyncBadge(report)}</div>
                </div>

                <p style={{ margin: '0.5rem 0', whiteSpace: 'pre-wrap' }}>{report.description}</p>

                <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.5rem', lineHeight: '1.4' }}>
                  <div><strong>Location:</strong> {report.location_text}</div>
                  {report.latitude !== null && report.longitude !== null && (
                    <div><strong>Coordinates:</strong> {report.latitude}, {report.longitude}</div>
                  )}
                  <div><strong>Reported at:</strong> {new Date(report.reported_at).toLocaleString()}</div>
                  {report.reporter_name && <div><strong>Reporter:</strong> {report.reporter_name}</div>}
                  <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem' }}>ID: {report.id}</div>
                </div>

                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {report.status === Status.DRAFT && role === Role.FIELD_WORKER && (
                    <button
                      type="button"
                      onClick={() => handleSubmitDraft(report.id)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        backgroundColor: '#0066cc',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}
                    >
                      Submit Draft
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleToggleEvents(report.id)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      backgroundColor: '#f0f0f0',
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    {isEventsOpen ? 'Hide History' : 'View History'}
                  </button>
                </div>

                {isEventsOpen && (
                  <div style={{ marginTop: '0.75rem', backgroundColor: '#f9f9f9', padding: '0.75rem', borderRadius: '4px', border: '1px solid #eee' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>Report History Events ({selectedReportEvents.events.length})</h4>
                    {selectedReportEvents.events.length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>No events recorded for this report.</div>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
                        {selectedReportEvents.events.map((evt) => (
                          <li key={evt.id} style={{ marginBottom: '0.25rem' }}>
                            <strong>{evt.type}</strong> by {evt.actor_role} at {new Date(evt.occurred_at).toLocaleTimeString()}{' '}
                            <span style={{ color: '#888' }}>(Delivered: {evt.delivered ? 'yes' : 'no'}, UUID: {evt.id.slice(0, 8)})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
