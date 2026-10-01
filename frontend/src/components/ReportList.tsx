import { useState } from 'react';
import { submitReport } from '../store';
import { Category, Priority, Role, Status, SyncState, type Report } from '../types';
import { CategoryBadge, PriorityBadge, StatusBadge, SyncStateBadge } from './Badges';

interface ReportListProps {
  reports: Report[];
  role: Role;
  onReportUpdated: () => void;
  onSelectReport: (report: Report) => void;
  onRetryFailed?: (id: string) => Promise<void>;
  onEditDraft?: (report: Report) => void;
  editingDraftId?: string | null;
}

export function ReportList({
  reports,
  role,
  onReportUpdated,
  onSelectReport,
  onRetryFailed,
  onEditDraft,
  editingDraftId,
}: ReportListProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Filters (FR-VEW-4)
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [syncStateFilter, setSyncStateFilter] = useState<string>('all');

  const handleSubmitDraft = async (reportId: string) => {
    setActionError(null);
    setSubmittingId(reportId);
    try {
      await submitReport(reportId);
      onReportUpdated();
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit draft.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleRetry = async (reportId: string) => {
    if (!onRetryFailed) return;
    setActionError(null);
    setRetryingId(reportId);
    try {
      await onRetryFailed(reportId);
      onReportUpdated();
    } catch (err: any) {
      setActionError(err.message || 'Failed to retry delivery.');
    } finally {
      setRetryingId(null);
    }
  };

  // Filter application
  const filteredReports = reports.filter((r) => {
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (syncStateFilter !== 'all' && r.sync_state !== syncStateFilter) return false;
    return true;
  });

  return (
    <section aria-labelledby="local-reports-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 id="local-reports-title" style={{ margin: 0 }}>
          Local Reports ({filteredReports.length} of {reports.length})
        </h2>
      </div>

      {actionError && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fff1f0',
            border: '1px solid #ffa39e',
            color: '#cf1322',
            padding: '0.75rem',
            marginBottom: '1rem',
            borderRadius: '4px',
          }}
        >
          {actionError}
        </div>
      )}

      {/* Filter controls */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          backgroundColor: '#f8f9fa',
          padding: '0.75rem 1rem',
          borderRadius: '4px',
          marginBottom: '1.25rem',
        }}
      >
        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Filters:</span>

        <div>
          <label htmlFor="filter-cat" style={{ fontSize: '0.85rem', marginRight: '0.3rem' }}>
            Category:
          </label>
          <select
            id="filter-cat"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: '0.3rem' }}
          >
            <option value="all">All Categories</option>
            {Object.values(Category).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-prio" style={{ fontSize: '0.85rem', marginRight: '0.3rem' }}>
            Priority:
          </label>
          <select
            id="filter-prio"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{ padding: '0.3rem' }}
          >
            <option value="all">All Priorities</option>
            {Object.values(Priority).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-status" style={{ fontSize: '0.85rem', marginRight: '0.3rem' }}>
            Status:
          </label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.3rem' }}
          >
            <option value="all">All Statuses</option>
            {Object.values(Status).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-sync" style={{ fontSize: '0.85rem', marginRight: '0.3rem' }}>
            Sync State:
          </label>
          <select
            id="filter-sync"
            value={syncStateFilter}
            onChange={(e) => setSyncStateFilter(e.target.value)}
            style={{ padding: '0.3rem' }}
          >
            <option value="all">All Sync States</option>
            <option value={SyncState.PENDING}>Not synchronized (Pending)</option>
            <option value={SyncState.SYNCHRONIZED}>Synchronized</option>
            <option value={SyncState.FAILED}>Sync Failed</option>
          </select>
        </div>
      </div>

      {filteredReports.length === 0 ? (
        <p style={{ color: '#666' }}>No matching reports recorded locally.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredReports.map((report) => (
            <article
              key={report.id}
              style={{
                border: editingDraftId === report.id ? '2px solid #1677ff' : '1px solid #d9d9d9',
                borderRadius: '4px',
                padding: '1rem',
                backgroundColor: report.status === Status.DRAFT ? (editingDraftId === report.id ? '#f0f5ff' : '#fafafa') : '#ffffff',
              }}
            >
              {/* Header with visual distinction badges */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <CategoryBadge category={report.category} />
                  <PriorityBadge priority={report.priority} />
                  <StatusBadge status={report.status} />
                  <SyncStateBadge syncState={report.sync_state} lastError={report.last_error} />
                </div>

                <button
                  type="button"
                  onClick={() => onSelectReport(report)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    backgroundColor: '#fff',
                    border: '1px solid #ccc',
                    borderRadius: '3px',
                  }}
                >
                  View Details
                </button>
              </div>

              {/* Description */}
              <p style={{ margin: '0.5rem 0', whiteSpace: 'pre-wrap' }}>{report.description}</p>

              {/* Fields */}
              <div style={{ fontSize: '0.85rem', color: '#555', lineHeight: '1.4' }}>
                <div><strong>Location:</strong> {report.location_text}</div>
                {report.latitude !== null && report.longitude !== null && (
                  <div><strong>Coordinates:</strong> {report.latitude}, {report.longitude}</div>
                )}
                <div><strong>Reported:</strong> {new Date(report.reported_at).toLocaleString()}</div>
                {report.reporter_name && <div><strong>Reporter:</strong> {report.reporter_name}</div>}
                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.2rem' }}>ID: {report.id}</div>
              </div>

              {/* Failed report reason banner and Retry button */}
              {report.sync_state === SyncState.FAILED && (
                <div
                  style={{
                    backgroundColor: '#fff1f0',
                    border: '1px solid #ffa39e',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '4px',
                    marginTop: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', color: '#cf1322' }}>
                    <strong>Failure reason:</strong> {report.last_error || 'Delivery failed'}
                  </div>
                  {onRetryFailed && (
                    <button
                      type="button"
                      onClick={() => handleRetry(report.id)}
                      disabled={retryingId === report.id}
                      style={{
                        padding: '0.3rem 0.75rem',
                        backgroundColor: '#cf1322',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                      }}
                    >
                      {retryingId === report.id ? 'Retrying...' : 'Retry Delivery'}
                    </button>
                  )}
                </div>
              )}

              {/* Draft Actions */}
              {report.status === Status.DRAFT && role === Role.FIELD_WORKER && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {onEditDraft && (
                    <button
                      type="button"
                      onClick={() => onEditDraft(report)}
                      style={{
                        padding: '0.35rem 0.8rem',
                        backgroundColor: '#faad14',
                        color: '#000',
                        border: '1px solid #d48806',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                      }}
                    >
                      {editingDraftId === report.id ? 'Editing Draft' : 'Edit Draft'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSubmitDraft(report.id)}
                    disabled={submittingId === report.id}
                    style={{
                      padding: '0.35rem 0.8rem',
                      backgroundColor: '#0958d9',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                    }}
                  >
                    {submittingId === report.id ? 'Submitting...' : 'Submit Draft'}
                  </button>
                  {editingDraftId === report.id && (
                    <span style={{ fontSize: '0.8rem', color: '#1677ff', fontStyle: 'italic' }}>
                      (currently open in form above)
                    </span>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
