import React from 'react';
import type { CentrifugoEvent } from '../services/centrifugoClient';

interface RightShowcasePanelProps {
  selectedJobIds: string[];
  activeJobIds: string[];
  sessionJobDescriptions: any[];
  toggleJobSelection: (jid: string) => void;
  openJobModal: (jid: string) => void;
  setSelectedJobIds: (ids: string[]) => void;
  liveEvents: CentrifugoEvent[];
}

export const RightShowcasePanel: React.FC<RightShowcasePanelProps> = ({
  selectedJobIds,
  activeJobIds,
  sessionJobDescriptions,
  toggleJobSelection,
  openJobModal,
  setSelectedJobIds,
  liveEvents,
}) => {
  return (
    <aside className="right-telemetry-panel">
      <div className="panel-header">
        <span>⚡ Workflow Control Panel</span>
      </div>

      {/* Metric summary */}
      <div className="panel-section">
        <span className="panel-section-title">Selected Job IDs ({selectedJobIds.length})</span>
        {selectedJobIds.length === 0 ? (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            No jobs selected. Click on job ID pills or job cards in chat to select.
          </span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {selectedJobIds.map((jid) => (
              <span
                key={jid}
                style={{
                  background: 'rgba(139, 92, 246, 0.2)',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  color: '#c084fc',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                onClick={() => toggleJobSelection(jid)}
              >
                {jid} ✕
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Available Job IDs in active session */}
      <div className="panel-section" style={{ flex: '0 0 auto', maxHeight: '160px', overflowY: 'auto' }}>
        <span className="panel-section-title">Available Session Job IDs ({activeJobIds.length})</span>
        {activeJobIds.length === 0 ? (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Run a scraper query to discover job IDs.
          </span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
            {activeJobIds.map((jid) => {
              const isSelected = selectedJobIds.includes(jid);
              return (
                <div key={jid} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span
                    className={`job-id-pill ${isSelected ? 'selected' : ''}`}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? '#8b5cf6' : 'rgba(255, 255, 255, 0.08)',
                      borderColor: isSelected ? '#a855f7' : 'rgba(255, 255, 255, 0.15)',
                      color: isSelected ? '#ffffff' : '#e2e8f0',
                      transition: 'all 0.2s ease',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                    onClick={() => {
                      if (!isSelected) {
                        toggleJobSelection(jid);
                      }
                      openJobModal(jid);
                    }}
                    title="Click to select & view details"
                  >
                    {isSelected ? '✅ ' : '🏷️ '} {jid}
                  </span>
                  <button
                    style={{
                      background: 'rgba(139, 92, 246, 0.2)',
                      border: '1px solid rgba(139, 92, 246, 0.4)',
                      color: '#ddd6fe',
                      borderRadius: '4px',
                      padding: '0.15rem 0.35rem',
                      fontSize: '0.65rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openJobModal(jid);
                    }}
                    title="View Job Details Popup"
                  >
                    📖
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Processed Session Jobs List (Persistent & Attached to Session) */}
      <div
        className="panel-section"
        style={{ flex: '0 0 auto', maxHeight: '260px', overflowY: 'auto' }}
      >
        <span className="panel-section-title">
          📋 Processed Session Jobs ({sessionJobDescriptions.length})
        </span>
        {sessionJobDescriptions.length === 0 ? (
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              display: 'block',
              marginTop: '0.4rem',
            }}
          >
            No processed job descriptions attached to this session yet.
          </span>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              marginTop: '0.5rem',
            }}
          >
            {sessionJobDescriptions.map((job: any, idx: number) => {
              const jid = job.job_id || job.id;
              const isSelected = selectedJobIds.includes(jid);
              return (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: isSelected ? '1px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '0.6rem 0.8rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: '#f8fafc',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '170px',
                      }}
                    >
                      {job.title || `Job ID: ${jid}`}
                    </span>
                    <span className="job-id-pill" style={{ fontSize: '0.62rem' }}>
                      {jid}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.73rem', color: '#c084fc' }}>
                    🏢 {job.company_name || 'Top MNC'} • 📍 {job.location || 'India / Remote'}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <button
                      style={{
                        flex: 1,
                        background: 'rgba(139, 92, 246, 0.2)',
                        border: '1px solid rgba(139, 92, 246, 0.4)',
                        color: '#ddd6fe',
                        borderRadius: '4px',
                        padding: '0.25rem 0.4rem',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                      onClick={() => openJobModal(jid)}
                    >
                      📖 View
                    </button>
                    <button
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '4px',
                        padding: '0.25rem 0.4rem',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                      onClick={() => {
                        if (!selectedJobIds.includes(jid)) {
                          setSelectedJobIds([jid]);
                        }
                      }}
                    >
                      ⚙️ Process
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Centrifugo Real-time Stream Log */}
      <div
        className="panel-section"
        style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <span className="panel-section-title">Centrifugo Real-time Event Stream</span>
        <div className="events-stream">
          {liveEvents.length === 0 ? (
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                textAlign: 'center',
                marginTop: '1rem',
              }}
            >
              Waiting for stream events...
            </div>
          ) : (
            liveEvents.map((evt, idx) => (
              <div key={idx} className="event-card">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="event-card-type">{evt.event_type}</span>
                  <span className="event-card-time">
                    {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : 'now'}
                  </span>
                </div>
                {evt.tool_name && <span style={{ color: '#60a5fa' }}>Tool: {evt.tool_name}</span>}
                {evt.tokens && <span>Tokens: {evt.tokens}</span>}
                {evt.time_taken_ms && <span>Time: {evt.time_taken_ms}ms</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
};
