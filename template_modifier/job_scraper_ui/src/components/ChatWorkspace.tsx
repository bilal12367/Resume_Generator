import React from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens?: number;
  time_taken_ms?: number;
  extracted_jobs?: string[];
  job_ids?: string[];
  jobs?: any[];
  isStreaming?: boolean;
}

interface ChatWorkspaceProps {
  activeSession: any | null;
  activeSessionId: string | null;
  isLoading: boolean;
  inputMessage: string;
  setInputMessage: (msg: string) => void;
  selectedJobIds: string[];
  toggleJobSelection: (jid: string) => void;
  openJobModal: (jid: string) => void;
  onSubmitSelectedJobs: () => void;
  onSendMessage: (text?: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  activeSession,
  activeSessionId,
  isLoading,
  inputMessage,
  setInputMessage,
  selectedJobIds,
  toggleJobSelection,
  openJobModal,
  onSubmitSelectedJobs,
  onSendMessage,
  messagesEndRef,
}) => {
  return (
    <main className="center-chat-area">
      {/* Session Title Header */}
      <div className="chat-header">
        <div>
          <div className="chat-header-title">
            <span>💬</span>
            <span>{activeSession?.title || 'Job Search Workspace'}</span>
          </div>
          <div className="chat-header-sub">ID: {activeSessionId || 'No active session'}</div>
        </div>
      </div>

      {/* Messages Timeline Container */}
      <div className="messages-container">
        {!activeSession || activeSession.messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">Search LinkedIn Jobs with AI Scraper Agent</div>
            <div className="empty-subtitle">
              Type a prompt like <em>"Find Software Engineer jobs in Hyderabad"</em> or{' '}
              <em>"Extract job details for python developer"</em> to start scraping and analyzing job postings.
            </div>
          </div>
        ) : (
          activeSession.messages.map((msg: Message) => (
            <div key={msg.id} className={`message-bubble ${msg.role}`}>
              <div className={`message-avatar ${msg.role}`}>
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-content-wrapper">
                <div className="message-body">
                  {msg.content}
                  {msg.isStreaming && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '14px',
                        backgroundColor: '#8b5cf6',
                        marginLeft: '4px',
                        animation: 'pulse 1s infinite',
                        borderRadius: '2px',
                        verticalAlign: 'middle',
                      }}
                    />
                  )}
                </div>

                {/* Render extracted candidate Job IDs per message turn */}
                {(() => {
                  const candidateJobs = (msg.extracted_jobs && msg.extracted_jobs.length > 0)
                    ? msg.extracted_jobs
                    : (msg.job_ids && msg.job_ids.length > 0 ? msg.job_ids : []);
                  
                  if (candidateJobs.length === 0) return null;

                  return (
                    <div
                      className="job-tags-container"
                      style={{
                        marginTop: '0.75rem',
                        padding: '0.8rem 1rem',
                        background: 'rgba(139, 92, 246, 0.08)',
                        border: '1px solid rgba(139, 92, 246, 0.25)',
                        borderRadius: '10px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '0.6rem',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        <span style={{ fontSize: '0.8rem', color: '#c084fc', fontWeight: 700 }}>
                          🎯 Candidate Jobs for Selection ({candidateJobs.length}):
                        </span>
                        <button
                          style={{
                            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                            border: 'none',
                            color: '#ffffff',
                            borderRadius: '6px',
                            padding: '0.3rem 0.75rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                          onClick={() => openJobModal(candidateJobs[0])}
                        >
                          🔍 Open Jobs Navigator & Details
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                        {candidateJobs.map((jid: string) => {
                          const isSelected = selectedJobIds.includes(jid);
                          return (
                            <div
                              key={jid}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <span
                                className={`job-id-pill ${isSelected ? 'selected' : ''}`}
                                style={{
                                  cursor: 'pointer',
                                  background: isSelected ? '#8b5cf6' : 'rgba(255, 255, 255, 0.08)',
                                  color: isSelected ? '#ffffff' : '#e2e8f0',
                                  border: isSelected ? '1px solid #a78bfa' : '1px solid rgba(255, 255, 255, 0.15)',
                                  transition: 'all 0.2s ease',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '6px',
                                  fontWeight: 600,
                                  fontSize: '0.78rem',
                                }}
                                onClick={() => toggleJobSelection(jid)}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleJobSelection(jid)}
                                  style={{ accentColor: '#8b5cf6', cursor: 'pointer' }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                {jid}
                              </span>
                              <button
                                style={{
                                  background: 'rgba(139, 92, 246, 0.2)',
                                  border: '1px solid rgba(139, 92, 246, 0.4)',
                                  color: '#ddd6fe',
                                  borderRadius: '4px',
                                  padding: '0.15rem 0.4rem',
                                  fontSize: '0.68rem',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openJobModal(jid);
                                }}
                                title="Explore Job Details"
                              >
                                📖 Details
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Render job cards if available */}
                {msg.jobs && msg.jobs.length > 0 && (
                  <div className="jobs-cards-grid">
                    {msg.jobs.map((job, idx) => {
                      const cardJid = job.job_id || job.id || `JOB_${idx + 1}`;
                      const isSelected = selectedJobIds.includes(cardJid);
                      return (
                        <div
                          key={idx}
                          className={`job-card ${isSelected ? 'selected' : ''}`}
                          style={{
                            cursor: 'pointer',
                            border: isSelected ? '1px solid #8b5cf6' : undefined,
                            boxShadow: isSelected ? '0 0 12px rgba(139, 92, 246, 0.4)' : undefined,
                            background: isSelected ? 'rgba(139, 92, 246, 0.1)' : undefined,
                            transition: 'all 0.2s ease',
                          }}
                          onClick={() => toggleJobSelection(cardJid)}
                        >
                          <div className="job-card-header">
                            <span className="job-card-title">{job.title || job.name || 'Job Title'}</span>
                            <span
                              className="job-id-pill"
                              style={{
                                fontSize: '0.65rem',
                                background: isSelected ? '#8b5cf6' : undefined,
                                color: isSelected ? '#ffffff' : undefined,
                              }}
                            >
                              {isSelected ? '✓ ' : ''}
                              {cardJid}
                            </span>
                          </div>
                          <div className="job-card-company">🏢 {job.company || 'Top MNC'}</div>
                          <div className="job-card-detail" style={{ justifyContent: 'space-between' }}>
                            <span>
                              📍 {job.location || 'India / Remote'} • 💼 {job.experience || '2-5 yrs'}
                            </span>
                            <button
                              style={{
                                background: 'rgba(139, 92, 246, 0.2)',
                                border: '1px solid rgba(139, 92, 246, 0.4)',
                                color: '#ddd6fe',
                                borderRadius: '4px',
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openJobModal(cardJid);
                              }}
                            >
                              📖 Explore JD
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Message Metadata metrics */}
                <div className="message-meta">
                  {msg.tokens && <span className="token-tag">⚡ {msg.tokens} tokens</span>}
                  {msg.time_taken_ms && (
                    <span className="latency-tag">⏱️ {(msg.time_taken_ms / 1000).toFixed(2)}s</span>
                  )}
                  <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Live Streaming Loading Badge */}
        {isLoading && (
          <div className="event-badge">
            <span className="event-badge-dot"></span>
            <span>Agent executing workflow & fetching job IDs...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Human in the Loop (HITL) Selected Job Action Floating Banner */}
      {selectedJobIds.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '5.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(99, 102, 241, 0.95))',
            backdropFilter: 'blur(12px)',
            border: '1px solid #a78bfa',
            boxShadow: '0 10px 30px rgba(139, 92, 246, 0.4)',
            padding: '0.75rem 1.2rem',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            zIndex: 100,
            maxWidth: '90%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>
              Selected {selectedJobIds.length} Job IDs:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {selectedJobIds.map((jid) => (
                <span
                  key={jid}
                  style={{
                    background: '#ffffff',
                    color: '#6366f1',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleJobSelection(jid)}
                >
                  {jid} ✕
                </span>
              ))}
            </div>
          </div>
          <button
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            }}
            onClick={onSubmitSelectedJobs}
          >
            ⚡ Submit to Agent Workflow
          </button>
        </div>
      )}

      {/* Chat Input Bar */}
      <div className="chat-input-area">
        {/* Preset Prompt Suggestions */}
        <div className="pills-bar">
          <span
            className="prompt-pill"
            onClick={() => onSendMessage('Search Full Stack Developer jobs in Hyderabad')}
          >
            💻 Full Stack in Hyderabad
          </span>
          <span
            className="prompt-pill"
            onClick={() => onSendMessage('Search Machine Learning Engineer jobs remote')}
          >
            🤖 Remote ML Engineer
          </span>
          <span
            className="prompt-pill"
            onClick={() => onSendMessage('Search Data Scientist job IDs in India')}
          >
            📊 Data Scientist Jobs
          </span>
        </div>

        <form
          className="input-box-wrapper"
          onSubmit={(e) => {
            e.preventDefault();
            onSendMessage();
          }}
        >
          <input
            type="text"
            className="chat-input"
            placeholder="Ask agent to search jobs, e.g. 'Search Python Developer jobs in Bangalore'..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" className="btn-send" disabled={isLoading || !inputMessage.trim()}>
            {isLoading ? '...' : 'Send ➤'}
          </button>
        </form>
      </div>
    </main>
  );
};
