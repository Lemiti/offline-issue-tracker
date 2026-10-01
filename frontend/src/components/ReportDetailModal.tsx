import { useEffect, useState } from 'react';
import { api } from '../api';
import { getReportEvents } from '../store';
import { SyncState, type Report, type ReportEvent } from '../types';
import { CategoryBadge, PriorityBadge, StatusBadge, SyncStateBadge } from './Badges';

interface ReportDetailModalProps {
  report: Report | null;
  isOnline: boolean;
  onClose: () => void;
  onRetry?: (id: string) => Promise<void>;
}

export function ReportDetailModal({ report, isOnline, onClose, onRetry }: ReportDetailModalProps) {
  const [events, setEvents] = useState<ReportEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(true);
  const [retrying, setRetrying] = useState<boolean>(false);

  useEffect(() => {
    if (!report) return;

    let isMounted = true;
    setLoadingEvents(true);

    const loadHistory = async () => {
      const eventsMap = new Map<string, ReportEvent>();

      // 1. Load local events from IndexedDB
      try {
        const localEvents = await getReportEvents(report.id);
        for (const evt of localEvents) {
          eventsMap.set(evt.id, evt);
        }
      } catch (err) {
        console.warn('Could not read local events:', err);
      }

      // 2. If report is synchronized and online, fetch server events
      if (report.sync_state === SyncState.SYNCHRONIZED && isOnline) {
        try {
          const serverDetail = await api.getReport(report.id);
          if (serverDetail.events && Array.isArray(serverDetail.events)) {
            for (const sEvt of serverDetail.events) {
              eventsMap.set(sEvt.id, {
                ...sEvt,
                delivered: true,
              });
            }
          }
        } catch (err) {
          console.warn('Could not fetch server events:', err);
        }
      }

      // 3. Sort chronologically by occurred_at
      const sortedEvents = Array.from(eventsMap.values()).sort(
        (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
      );

      if (isMounted) {
        setEvents(sortedEvents);
        setLoadingEvents(false);
      }
    };

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [report, isOnline]);

  if (!report) return null;

  const handleRetry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry(report.id);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '6px',
          width: '100%',
          maxWidth: '750px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            backgroundColor: '#fafafa',
          }}
        >
          <div>
            <h2 id="detail-title" style={{ margin: 0, fontSize: '1.25rem' }}>
              Report Details
            </h2>
            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.2rem' }}>
              ID: {report.id}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.4rem',
              cursor: 'pointer',
              lineHeight: 1,
              color: '#666',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
          {/* Status and Sync State Bar */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: '1.25rem',
            }}
          >
            <CategoryBadge category={report.category} />
            <PriorityBadge priority={report.priority} />
            <StatusBadge status={report.status} />
            <SyncStateBadge syncState={report.sync_state} lastError={report.last_error} />
          </div>

          {/* Failure Alert & Retry button */}
          {report.sync_state === SyncState.FAILED && (
            <div
              style={{
                backgroundColor: '#fff1f0',
                border: '1px solid #ffa39e',
                color: '#cf1322',
                padding: '0.75rem',
                borderRadius: '4px',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <strong>Delivery Failure:</strong> {report.last_error || 'Unknown error occurred during sync.'}
              </div>
              {onRetry && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying}
                  style={{
                    backgroundColor: '#cf1322',
                    color: '#fff',
                    border: 'none',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  {retrying ? 'Retrying...' : 'Retry Delivery'}
                </button>
              )}
            </div>
          )}

          {/* Field Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <strong style={{ fontSize: '0.85rem', color: '#555', display: 'block' }}>Description</strong>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.2rem', lineHeight: '1.4' }}>
                {report.description}
              </div>
            </div>

            <div>
              <strong style={{ fontSize: '0.85rem', color: '#555', display: 'block' }}>Location</strong>
              <div style={{ marginTop: '0.2rem' }}>{report.location_text}</div>
              {report.latitude !== null && report.longitude !== null ? (
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.2rem' }}>
                  GPS: {report.latitude}, {report.longitude}
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: '#888', marginTop: '0.2rem' }}>
                  Coordinates: Not specified
                </div>
              )}
            </div>

            <div>
              <strong style={{ fontSize: '0.85rem', color: '#555', display: 'block' }}>Reported At</strong>
              <div style={{ marginTop: '0.2rem' }}>
                {new Date(report.reported_at).toLocaleString()}
              </div>
              {report.reporter_name && (
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.2rem' }}>
                  Reporter: {report.reporter_name}
                </div>
              )}
            </div>

            <div>
              <strong style={{ fontSize: '0.85rem', color: '#555', display: 'block' }}>Server Timestamps</strong>
              <div style={{ fontSize: '0.85rem', marginTop: '0.2rem', color: '#444' }}>
                Received: {report.received_at ? new Date(report.received_at).toLocaleString() : 'Not received yet'}
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.2rem', color: '#444' }}>
                Updated: {report.updated_at ? new Date(report.updated_at).toLocaleString() : 'N/A'}
              </div>
            </div>
          </div>

          {/* History in Time Order */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.05rem' }}>
              History Events (in chronological order)
            </h3>

            {loadingEvents ? (
              <p style={{ color: '#666', fontSize: '0.9rem' }}>Loading event history...</p>
            ) : events.length === 0 ? (
              <p style={{ color: '#666', fontSize: '0.9rem' }}>No history events found.</p>
            ) : (
              <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
                {events.map((evt) => (
                  <li key={evt.id} style={{ marginBottom: '0.6rem', fontSize: '0.85rem', lineHeight: '1.4' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#1677ff' }}>{evt.type}</strong>
                      <span style={{ color: '#555' }}>
                        by <strong>{evt.actor_role}</strong> at {new Date(evt.occurred_at).toLocaleString()}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '3px',
                          backgroundColor: evt.delivered ? '#f6ffed' : '#fffbe6',
                          border: `1px solid ${evt.delivered ? '#b7eb8f' : '#ffe58f'}`,
                          color: evt.delivered ? '#389e0d' : '#d48806',
                        }}
                      >
                        {evt.delivered ? 'Delivered' : 'Local only'}
                      </span>
                    </div>

                    {evt.details && Object.keys(evt.details).length > 0 && (
                      <div
                        style={{
                          backgroundColor: '#f9f9f9',
                          padding: '0.35rem 0.5rem',
                          borderRadius: '3px',
                          marginTop: '0.25rem',
                          fontSize: '0.8rem',
                          color: '#444',
                        }}
                      >
                        {evt.details.from && evt.details.to && (
                          <div>
                            Transition: <strong>{evt.details.from}</strong> → <strong>{evt.details.to}</strong>
                          </div>
                        )}
                        {evt.details.reason && (
                          <div>
                            Reason: <em>"{evt.details.reason}"</em>
                          </div>
                        )}
                        {evt.details.error && (
                          <div style={{ color: '#cf1322' }}>
                            Error: {evt.details.error}
                          </div>
                        )}
                        {evt.details.action && (
                          <div>Action: {evt.details.action}</div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid #eee',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#fafafa',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f0f0f0',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
