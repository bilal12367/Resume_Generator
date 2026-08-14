import React from 'react';

export interface SessionItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: any[];
  total_tokens?: number;
  total_time_ms?: number;
  job_ids?: string[];
}

interface SidebarSessionsProps {
  filteredSessions: SessionItem[];
  activeSessionId: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onCreateSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (e: React.MouseEvent, id: string) => void;
}

export const SidebarSessions: React.FC<SidebarSessionsProps> = ({
  filteredSessions,
  activeSessionId,
  searchQuery,
  setSearchQuery,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
}) => {
  return (
    <aside className="sidebar-sessions">
      <div className="sidebar-header">
        <button className="btn-new-chat" onClick={onCreateSession}>
          <span>+</span> New Job Search
        </button>
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="session-list">
        {filteredSessions.length === 0 ? (
          <div
            style={{
              padding: '1.5rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
            }}
          >
            No sessions found. Click "+ New Job Search" to start.
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${session.id === activeSessionId ? 'active' : ''}`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="session-item-top">
                <span className="session-title">{session.title}</span>
                <button
                  className="btn-delete-session"
                  title="Delete Session"
                  onClick={(e) => onDeleteSession(e, session.id)}
                >
                  ✕
                </button>
              </div>
              <div className="session-item-meta">
                <span>{session.messages ? session.messages.length : 0} msgs</span>
                <span className="session-badge">{session.total_tokens || 0} tok</span>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};
