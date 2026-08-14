import React from 'react';

interface HeaderProps {
  grandTotalTokens: number;
  activeSessionTokens: number;
  activeSessionTimeSec: string;
  wsConnected: boolean;
  wsStatusText: string;
  mainActiveTab: 'scraper' | 'direct_jd';
  setMainActiveTab: (tab: 'scraper' | 'direct_jd') => void;
  directJdSessionId: string;
  setDirectJdSessionId: (id: string) => void;
  activeSessionId: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  grandTotalTokens,
  activeSessionTokens,
  activeSessionTimeSec,
  wsConnected,
  wsStatusText,
  mainActiveTab,
  setMainActiveTab,
  directJdSessionId,
  setDirectJdSessionId,
  activeSessionId,
}) => {
  return (
    <header className="app-header">
      <div className="brand-container">
        <div className="brand-icon">JS</div>
        <div>
          <span className="brand-title">Job Scraper Agent</span>
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.1rem' }}>
            <span className="brand-tag">AI Powered</span>
            <span className="brand-tag" style={{ borderColor: '#8b5cf6', color: '#c084fc' }}>
              Centrifugo Live
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Screen Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1.5rem' }}>
        <button
          onClick={() => setMainActiveTab('scraper')}
          style={{
            background:
              mainActiveTab === 'scraper'
                ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                : 'rgba(255,255,255,0.06)',
            border:
              mainActiveTab === 'scraper'
                ? '1px solid #a78bfa'
                : '1px solid rgba(255,255,255,0.15)',
            color: '#ffffff',
            padding: '0.4rem 0.9rem',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s ease',
          }}
        >
          🤖 Agent Job Scraper
        </button>
        <button
          onClick={() => {
            setMainActiveTab('direct_jd');
            if (!directJdSessionId && activeSessionId) setDirectJdSessionId(activeSessionId);
          }}
          style={{
            background:
              mainActiveTab === 'direct_jd'
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'rgba(255,255,255,0.06)',
            border:
              mainActiveTab === 'direct_jd'
                ? '1px solid #34d399'
                : '1px solid rgba(255,255,255,0.15)',
            color: '#ffffff',
            padding: '0.4rem 0.9rem',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s ease',
          }}
        >
          📝 Direct JD & PDF Generator
        </button>
      </div>

      {/* Global Metrics Bar */}
      <div className="metrics-bar">
        <div className="metric-pill">
          <span className="metric-pill-label">Total Tokens</span>
          <span className="metric-pill-value highlight-amber">
            {grandTotalTokens.toLocaleString()}
          </span>
        </div>
        <div className="metric-pill">
          <span className="metric-pill-label">Session Tokens</span>
          <span className="metric-pill-value">{activeSessionTokens.toLocaleString()}</span>
        </div>
        <div className="metric-pill">
          <span className="metric-pill-label">Total Time</span>
          <span className="metric-pill-value highlight-green">{activeSessionTimeSec}s</span>
        </div>

        <div className={`status-pill ${wsConnected ? 'connected' : ''}`}>
          <span className="status-dot"></span>
          <span>{wsStatusText}</span>
        </div>
      </div>
    </header>
  );
};
