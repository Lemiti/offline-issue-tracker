import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Category, Priority, Role, Status, SyncState, type Report } from '../types';
import { CategoryBadge, PriorityBadge, StatusBadge, SyncStateBadge } from './Badges';

interface CoordinatorViewProps {
  isOnline: boolean;
  onSelectReport: (report: Report) => void;
}

interface TransitionRule {
  to: Status;
  label: string;
  requiresReason: boolean;
}

const VALID_TRANSITIONS: Record<string, TransitionRule[]> = {
  [Status.SUBMITTED]: [
    { to: Status.ASSIGNED, label: 'Assign', requiresReason: false },
    { to: Status.REJECTED, label: 'Reject', requiresReason: true },
  ],
  [Status.ASSIGNED]: [
    { to: Status.IN_PROGRESS, label: 'Start Progress', requiresReason: false },
    { to: Status.REJECTED, label: 'Reject', requiresReason: true },
  ],
  [Status.IN_PROGRESS]: [
    { to: Status.RESOLVED, label: 'Resolve', requiresReason: false },
  ],
  [Status.RESOLVED]: [
    { to: Status.IN_PROGRESS, label: 'Reopen', requiresReason: true },
  ],
  [Status.REJECTED]: [],
};

export function CoordinatorView({ isOnline, onSelectReport }: CoordinatorViewProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Reason prompt state
  const [promptTarget, setPromptTarget] = useState<{
    report: Report;
    rule: TransitionRule;
  } | null>(null);
  const [reasonInput, setReasonInput] = useState<string>('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submittingTransition, setSubmittingTransition] = useState<boolean>(false);

  const fetchReports = async () => {
    if (!isOnline) return;

    setLoading(true);
    setServerError(null);

    try {
      const params: any = {};
      if (categoryFilter !== 'all') params.category = categoryFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      if (statusFilter !== 'all') params.status = statusFilter;

      const results = await api.getReports(params);
      setReports(results);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setServerError(`Failed to load server reports (${err.code}): ${err.message}`);
      } else {
        setServerError(err.message || 'Network error fetching server reports.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [isOnline, categoryFilter, priorityFilter, statusFilter]);

  const executeTransition = async (report: Report, toStatus: Status, reason?: string) => {
    setSubmittingTransition(true);
    setServerError(null);
    setSuccessMessage(null);

    try {
      await api.transitionReport(
        report.id,
        {
          to: toStatus,
          reason: reason || null,
          expected_status: report.status,
        },
        Role.COORDINATOR
      );

      setSuccessMessage(`Report ${report.id.slice(0, 8)} transitioned to '${toStatus}'.`);
      setPromptTarget(null);
      setReasonInput('');
      await fetchReports();
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setServerError('403 Forbidden: Coordinator permissions required.');
        } else if (err.status === 409 && err.code === 'STALE_STATUS') {
          setServerError(
            '409 STALE_STATUS: Another coordinator modified this report. The report list has been refreshed.'
          );
          await fetchReports();
        } else if (err.status === 409 && err.code === 'INVALID_TRANSITION') {
          setServerError(`409 INVALID_TRANSITION: ${err.message}`);
        } else if (err.status === 422) {
          setServerError(`422 Unprocessable Content: ${err.message}`);
        } else {
          setServerError(`Server Error (${err.code}): ${err.message}`);
        }
      } else {
        setServerError(err.message || 'Network failure while requesting transition.');
      }
    } finally {
      setSubmittingTransition(false);
    }
  };

  const handleTransitionClick = (report: Report, rule: TransitionRule) => {
    if (!isOnline) return;

    if (rule.requiresReason) {
      setPromptTarget({ report, rule });
      setReasonInput('');
      setReasonError(null);
    } else {
      executeTransition(report, rule.to);
    }
  };

  const handleConfirmReason = () => {
    if (!promptTarget) return;

    const trimmed = reasonInput.trim();
    if (!trimmed) {
      setReasonError('A reason is mandatory for this transition (SRS FR-WFL-4).');
      return;
    }

    executeTransition(promptTarget.report, promptTarget.rule.to, trimmed);
  };

  return (
    <section aria-labelledby="coordinator-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <h2 id="coordinator-title" style={{ margin: 0 }}>
          Coordinator Dashboard (Central Server Records)
        </h2>
        {isOnline && (
          <button
            type="button"
            onClick={fetchReports}
            disabled={loading}
            style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
          >
            {loading ? 'Refreshing...' : 'Refresh List'}
          </button>
        )}
      </div>

      {!isOnline && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fffbe6',
            border: '1px solid #ffe58f',
            color: '#d48806',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1.5rem',
            lineHeight: '1.4',
          }}
        >
          <strong>⚠️ Coordinator Actions Disabled (Offline):</strong> Central server connectivity is required to view and modify central workflow statuses (SRS FR-OFF-5). Reconnect to the network to resume coordinator tasks.
        </div>
      )}

      {serverError && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fff1f0',
            border: '1px solid #ffa39e',
            color: '#cf1322',
            padding: '0.85rem',
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
        >
          {serverError}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          style={{
            backgroundColor: '#f6ffed',
            border: '1px solid #b7eb8f',
            color: '#389e0d',
            padding: '0.85rem',
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
        >
          {successMessage}
        </div>
      )}

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          backgroundColor: '#f8f9fa',
          padding: '0.75rem 1rem',
          borderRadius: '4px',
          marginBottom: '1.5rem',
        }}
      >
        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Filters:</span>

        <div>
          <label htmlFor="coord-filter-cat" style={{ fontSize: '0.85rem', marginRight: '0.3rem' }}>
            Category:
          </label>
          <select
            id="coord-filter-cat"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            disabled={!isOnline}
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
          <label htmlFor="coord-filter-prio" style={{ fontSize: '0.85rem', marginRight: '0.3rem' }}>
            Priority:
          </label>
          <select
            id="coord-filter-prio"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            disabled={!isOnline}
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
          <label htmlFor="coord-filter-status" style={{ fontSize: '0.85rem', marginRight: '0.3rem' }}>
            Status:
          </label>
          <select
            id="coord-filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            disabled={!isOnline}
            style={{ padding: '0.3rem' }}
          >
            <option value="all">All Statuses</option>
            <option value={Status.SUBMITTED}>{Status.SUBMITTED}</option>
            <option value={Status.ASSIGNED}>{Status.ASSIGNED}</option>
            <option value={Status.IN_PROGRESS}>{Status.IN_PROGRESS}</option>
            <option value={Status.RESOLVED}>{Status.RESOLVED}</option>
            <option value={Status.REJECTED}>{Status.REJECTED}</option>
          </select>
        </div>
      </div>

      {/* Reports List */}
      {loading ? (
        <p>Loading server reports...</p>
      ) : !isOnline && reports.length === 0 ? (
        <p style={{ color: '#666' }}>No server reports available while offline.</p>
      ) : reports.length === 0 ? (
        <p style={{ color: '#666' }}>No matching reports found on server.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reports.map((report) => {
            const validMoves = VALID_TRANSITIONS[report.status] || [];
            const isTerminal = validMoves.length === 0;

            return (
              <article
                key={report.id}
                style={{
                  border: '1px solid #d9d9d9',
                  borderRadius: '4px',
                  padding: '1rem',
                  backgroundColor: '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <CategoryBadge category={report.category} />
                    <PriorityBadge priority={report.priority} />
                    <StatusBadge status={report.status} />
                    <SyncStateBadge syncState={SyncState.SYNCHRONIZED} />
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectReport(report)}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    View Details
                  </button>
                </div>

                <p style={{ margin: '0.5rem 0', whiteSpace: 'pre-wrap' }}>{report.description}</p>

                <div style={{ fontSize: '0.85rem', color: '#555', lineHeight: '1.4', marginBottom: '0.75rem' }}>
                  <div><strong>Location:</strong> {report.location_text}</div>
                  <div><strong>Reported:</strong> {new Date(report.reported_at).toLocaleString()}</div>
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>ID: {report.id}</div>
                </div>

                {/* Workflow Transitions */}
                <div
                  style={{
                    borderTop: '1px solid #eee',
                    paddingTop: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Workflow:</span>

                  {isTerminal ? (
                    <span style={{ fontSize: '0.85rem', color: '#888', fontStyle: 'italic' }}>
                      Terminal status (No further transitions allowed)
                    </span>
                  ) : (
                    validMoves.map((rule) => (
                      <button
                        key={rule.to}
                        type="button"
                        disabled={!isOnline || submittingTransition}
                        onClick={() => handleTransitionClick(report, rule)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '3px',
                          fontSize: '0.85rem',
                          cursor: isOnline ? 'pointer' : 'not-allowed',
                          backgroundColor: rule.to === Status.REJECTED ? '#fff1f0' : '#e6f7ff',
                          color: rule.to === Status.REJECTED ? '#cf1322' : '#0958d9',
                          border: `1px solid ${rule.to === Status.REJECTED ? '#ffa39e' : '#91caff'}`,
                          fontWeight: 'bold',
                        }}
                      >
                        {rule.label} {rule.requiresReason ? '...' : ''}
                      </button>
                    ))
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Reason Requirement Modal / Dialog */}
      {promptTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reason-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '6px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <h3 id="reason-title" style={{ marginTop: 0 }}>
              Reason Required: {promptTarget.rule.label} Report
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#555' }}>
              Moving from <strong>{promptTarget.report.status}</strong> to <strong>{promptTarget.rule.to}</strong> requires a documented reason (SRS FR-WFL-4).
            </p>

            {reasonError && (
              <div style={{ color: '#cf1322', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                {reasonError}
              </div>
            )}

            <textarea
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              rows={3}
              placeholder="State the reason clearly..."
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setPromptTarget(null)}
                disabled={submittingTransition}
                style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReason}
                disabled={submittingTransition}
                style={{
                  padding: '0.4rem 0.8rem',
                  backgroundColor: '#0958d9',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                {submittingTransition ? 'Saving...' : 'Confirm Transition'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
