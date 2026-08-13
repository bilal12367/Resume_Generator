import React, { useState, useEffect, useRef } from 'react';
import { centrifugoService } from '../services/centrifugoClient';
import type { CentrifugoEvent } from '../services/centrifugoClient';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  job_ids?: string[];
  jobs?: any[];
  tokens?: number;
  time_taken_ms?: number;
  timestamp: string;
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
  total_tokens: number;
  total_time_ms: number;
  job_ids: string[];
  jobs: any[];
}

const API_BASE = 'http://127.0.0.1:8080';

export const Home: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [wsStatusText, setWsStatusText] = useState<string>('Connecting...');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [jobFilterText, setJobFilterText] = useState<string>('');
  const [liveEvents, setLiveEvents] = useState<CentrifugoEvent[]>([]);

  // Job Description Explorer & ATS Resume Generation state
  const [jobDescriptionsMap, setJobDescriptionsMap] = useState<Record<string, any>>({});
  const [sessionJobDescriptions, setSessionJobDescriptions] = useState<any[]>([]);
  const [activeModalJobId, setActiveModalJobId] = useState<string | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'summary' | 'json' | 'pdf'>('summary');
  const [modalSessionIdInput, setModalSessionIdInput] = useState<string>('');
  const [isRegeneratingPdf, setIsRegeneratingPdf] = useState<boolean>(false);
  const [isGeneratingResumes, setIsGeneratingResumes] = useState<boolean>(false);
  const [atsProgressStatus, setAtsProgressStatus] = useState<string>('');
  const [generatedAtsResults, setGeneratedAtsResults] = useState<any[]>([]);
  const [toastNotification, setToastNotification] = useState<{ message: string; jobId?: string; type?: 'success' | 'error' | 'info' } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss toast notifications after 6 seconds
  useEffect(() => {
    if (toastNotification) {
      const timer = setTimeout(() => {
        setToastNotification(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [toastNotification]);

  // Toggle selection of a Job ID
  const toggleJobSelection = (jid: string) => {
    setSelectedJobIds((prev) =>
      prev.includes(jid) ? prev.filter((id) => id !== jid) : [...prev, jid]
    );
  };

  // Submit selected Job IDs to agent (Human-in-the-Loop completion)
  const handleSubmitSelectedJobs = () => {
    if (selectedJobIds.length === 0) return;
    const prompt = `I select the following Job IDs to process: ${selectedJobIds.join(', ')}. Please proceed with these jobs.`;
    setSelectedJobIds([]);
    handleSendMessage(prompt);
  };

  // Fetch stored job descriptions for active session
  const fetchJobDescriptions = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/job-descriptions`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && Array.isArray(data.jobs)) {
          setSessionJobDescriptions(data.jobs);
          const map: Record<string, any> = {};
          data.jobs.forEach((j: any) => {
            if (j.job_id) map[j.job_id] = j;
          });
          setJobDescriptionsMap((prev) => ({ ...prev, ...map }));
        }
      }
    } catch (e) {
      console.warn('Failed to fetch job descriptions:', e);
    }
  };

  // Fetch stored ATS resumes for active session
  const fetchAtsResumes = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/ats-resumes`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && Array.isArray(data.resumes)) {
          setGeneratedAtsResults((prev) => {
            const map = new Map(prev.map((r) => [r.job_id, r]));
            data.resumes.forEach((r: any) => map.set(r.job_id, r));
            return Array.from(map.values());
          });
        }
      }
    } catch (e) {
      console.warn('Failed to fetch ATS resumes:', e);
    }
  };

  // Open modal and load existing ATS resume data for job ID
  const openJobModal = async (jid: string) => {
    setActiveModalJobId(jid);
    setModalSessionIdInput(activeSessionId || '');
    const existing = generatedAtsResults.find((r) => r.job_id === jid);
    if (existing && (existing.generated_json || existing.generated_data)) {
      if (existing.output_pdf_folder) {
        setModalActiveTab('pdf');
      } else {
        setModalActiveTab('json');
      }
    } else {
      setModalActiveTab('summary');
    }

    try {
      const res = await fetch(`${API_BASE}/jobs/${jid}/ats-resume`);
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.resume) {
          setGeneratedAtsResults((prev) => {
            const existingIndex = prev.findIndex((r) => r.job_id === jid);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = data.resume;
              return updated;
            }
            return [...prev, data.resume];
          });
          if (data.resume.output_pdf_folder) {
            setModalActiveTab('pdf');
          } else if (data.resume.generated_json || data.resume.generated_data) {
            setModalActiveTab('json');
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch job ATS resume:', e);
    }
  };

  // Regenerate PDF for active modal job ID with custom session ID
  const handleRegeneratePdfForModal = async () => {
    if (!activeModalJobId || isRegeneratingPdf) return;
    const targetSessionId = modalSessionIdInput.trim() || activeSessionId || 'default';
    setIsRegeneratingPdf(true);
    try {
      const res = await fetch(`${API_BASE}/regenerate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: targetSessionId,
          job_id: activeModalJobId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          setGeneratedAtsResults((prev) => {
            const existingIndex = prev.findIndex((r) => r.job_id === activeModalJobId);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = data;
              return updated;
            }
            return [...prev, data];
          });
          setModalActiveTab('pdf');
          setToastNotification({
            message: `🎉 PDFs successfully regenerated & saved under session '${targetSessionId}'!`,
            jobId: activeModalJobId,
            type: 'success',
          });
        }
      } else {
        const err = await res.json();
        setToastNotification({
          message: `⚠️ Error regenerating PDFs: ${err.detail || 'Failed to process'}`,
          type: 'error',
        });
      }
    } catch (e: any) {
      console.error('Failed to regenerate PDFs:', e);
      setToastNotification({
        message: `⚠️ Connection error: ${e.message}`,
        type: 'error',
      });
    } finally {
      setIsRegeneratingPdf(false);
    }
  };

  // Trigger ATS Resume Generation workflow for selected Job IDs or a specific job ID
  const handleGenerateATSResumes = async (jobIdsToProcess?: string[]) => {
    const ids = jobIdsToProcess || selectedJobIds;
    if (ids.length === 0 || !activeSessionId || isGeneratingResumes) return;
    setIsGeneratingResumes(true);
    setAtsProgressStatus(`Starting ATS Resume & PDF Generation for ${ids.length} Job ID${ids.length > 1 ? 's' : ''}...`);
    try {
      const res = await fetch(`${API_BASE}/generate-ats-resumes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSessionId,
          job_ids: ids,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && Array.isArray(data.results)) {
          setGeneratedAtsResults(data.results);
          setToastNotification({
            message: `🎉 Successfully generated ATS Resumes & PDFs for ${ids.length} Job ID${ids.length > 1 ? 's' : ''}!`,
            type: 'success',
          });
        }
      } else {
        const err = await res.json();
        setToastNotification({
          message: `⚠️ Error generating resumes: ${err.detail || 'Failed to process'}`,
          type: 'error',
        });
      }
    } catch (e: any) {
      console.error('Failed to generate ATS resumes:', e);
      setToastNotification({
        message: `⚠️ Connection error: ${e.message}`,
        type: 'error',
      });
    } finally {
      setIsGeneratingResumes(false);
      setAtsProgressStatus('');
    }
  };

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Connect Centrifugo on mount
  useEffect(() => {
    centrifugoService.connect('workflow');
    centrifugoService.onStatusChange((connected, statusText) => {
      setWsConnected(connected);
      setWsStatusText(statusText);
    });

    centrifugoService.on('all', (event: CentrifugoEvent) => {
      setLiveEvents((prev) => [event, ...prev.slice(0, 49)]);
    });

    fetchSessions();

    return () => {
      centrifugoService.disconnect();
    };
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      fetchJobDescriptions(activeSessionId);
      fetchAtsResumes(activeSessionId);
    }
  }, [activeSessionId]);

  // Centrifugo live listener for job description events & ATS progress
  useEffect(() => {
    centrifugoService.on('all', (evt: CentrifugoEvent) => {
      const anyEvt = evt as any;
      if (anyEvt.event_type === 'job_descriptions_saved' || anyEvt.event === 'process_jobs') {
        const jobs = anyEvt.jobs || [];
        if (Array.isArray(jobs) && jobs.length > 0) {
          const map: Record<string, any> = {};
          jobs.forEach((j: any) => {
            const jid = j.job_id || j.id;
            if (jid) map[jid] = j;
          });
          setJobDescriptionsMap((prev) => ({ ...prev, ...map }));
          setSessionJobDescriptions((prev) => {
            const existingIds = new Set(prev.map((pj) => pj.job_id || pj.id));
            const newJobs = jobs.filter((j) => !existingIds.has(j.job_id || j.id));
            return [...newJobs, ...prev];
          });
          const firstJid = jobs[0].job_id || jobs[0].id;
          setToastNotification({
            message: `🎉 ${jobs.length} Job Description${jobs.length > 1 ? 's' : ''} Processed & Saved! Click to explore.`,
            jobId: firstJid,
          });
        }
      }
      if (anyEvt.event_type === 'ats_generation_progress') {
        setIsGeneratingResumes(true);
        setAtsProgressStatus(anyEvt.status || 'Processing ATS Resume & PDF generation...');
      }
      if (anyEvt.event_type === 'ats_generation_completed') {
        setIsGeneratingResumes(false);
        setAtsProgressStatus('');
        if (Array.isArray(anyEvt.results)) {
          setGeneratedAtsResults(anyEvt.results);
        }
      }
    });

    return () => {};
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSessionId, sessions, isLoading]);

  // Fetch all sessions from backend
  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'ok' && Array.isArray(data.sessions)) {
        setSessions(data.sessions);
        if (data.sessions.length > 0 && !activeSessionId) {
          setActiveSessionId(data.sessions[0].id);
        }
      }
    } catch (e) {
      console.warn('Backend server not reachable yet or session list empty:', e);
    }
  };

  // Create a new session
  const handleCreateSession = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Job Search Session #${sessions.length + 1}` }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.session) {
          setSessions((prev) => [data.session, ...prev]);
          setActiveSessionId(data.session.id);
        }
      }
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  };

  // Delete a session
  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  // Send prompt to backend /scrape
  const handleSendMessage = async (promptOverride?: string) => {
    const textToSend = promptOverride || inputMessage;
    if (!textToSend.trim() || isLoading) return;

    setInputMessage('');
    setIsLoading(true);

    let targetSessionId = activeSessionId;
    let currentSession = sessions.find((s) => s.id === targetSessionId);

    // If no active session, create local optimistic session
    if (!targetSessionId || !currentSession) {
      const tempId = 'session_' + Date.now();
      targetSessionId = tempId;
      currentSession = {
        id: tempId,
        title: textToSend.length > 30 ? textToSend.slice(0, 30) + '...' : textToSend,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
        total_tokens: 0,
        total_time_ms: 0,
        job_ids: [],
        jobs: [],
      };
      setSessions((prev) => [currentSession!, ...prev]);
      setActiveSessionId(tempId);
    }

    // Optimistically push user message
    const userMsg: Message = {
      id: 'user_' + Date.now(),
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString(),
    };

    setSessions((prev) =>
      prev.map((s) => (s.id === targetSessionId ? { ...s, messages: [...s.messages, userMsg] } : s))
    );

    try {
      const res = await fetch(`${API_BASE}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          session_id: targetSessionId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.session) {
          // Replace session state with backend authoritative state
          setSessions((prev) =>
            prev.map((s) => (s.id === data.session.id ? data.session : s))
          );
          if (data.session.id !== targetSessionId) {
            setActiveSessionId(data.session.id);
          }
        }
      } else {
        const errText = await res.text();
        const errObj = JSON.parse(errText || '{}');
        const assistantErrorMsg: Message = {
          id: 'err_' + Date.now(),
          role: 'assistant',
          content: `⚠️ Error: ${errObj.detail || 'Failed to process request.'}`,
          timestamp: new Date().toISOString(),
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === targetSessionId ? { ...s, messages: [...s.messages, assistantErrorMsg] } : s
          )
        );
      }
    } catch (e: any) {
      const assistantErrorMsg: Message = {
        id: 'err_' + Date.now(),
        role: 'assistant',
        content: `⚠️ Connection Error: Ensure job_scraper.py server is running on port 8080. (${e.message})`,
        timestamp: new Date().toISOString(),
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId ? { ...s, messages: [...s.messages, assistantErrorMsg] } : s
        )
      );
    } finally {
      setIsLoading(false);
      fetchSessions();
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Compute total tokens across all sessions
  const grandTotalTokens = sessions.reduce((acc, s) => acc + (s.total_tokens || 0), 0);
  const activeSessionTokens = activeSession?.total_tokens || 0;
  const activeSessionTimeSec = ((activeSession?.total_time_ms || 0) / 1000).toFixed(2);

  // Collect unique job IDs across active session
  const activeJobIds = activeSession?.job_ids || [];

  return (
    <div className="app-container">
      {/* Floating Popup Toast Notification for Processed Jobs & PDF Operations */}
      {toastNotification && (() => {
        const isSuccess = toastNotification.type === 'success';
        const isError = toastNotification.type === 'error';
        const bgGradient = isSuccess
          ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
          : isError
          ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
          : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)';
        const borderStyle = isSuccess ? '1px solid #34d399' : isError ? '1px solid #fca5a5' : '1px solid #a78bfa';
        const shadowStyle = isSuccess
          ? '0 10px 30px rgba(16, 185, 129, 0.45)'
          : isError
          ? '0 10px 30px rgba(239, 68, 68, 0.45)'
          : '0 10px 30px rgba(139, 92, 246, 0.45)';
        const icon = isSuccess ? '🎉' : isError ? '⚠️' : '🔔';

        return (
          <div
            style={{
              position: 'fixed',
              top: '1.2rem',
              right: '1.5rem',
              zIndex: 10000,
              background: bgGradient,
              border: borderStyle,
              boxShadow: shadowStyle,
              color: '#ffffff',
              padding: '0.85rem 1.3rem',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem',
              maxWidth: '450px',
              animation: 'slideIn 0.3s ease-out',
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>{icon}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: '1.4', flex: 1 }}>
              {toastNotification.message}
            </span>
            {toastNotification.jobId && (
              <button
                onClick={() => {
                  openJobModal(toastNotification.jobId!);
                  setToastNotification(null);
                }}
                style={{
                  background: '#ffffff',
                  color: isSuccess ? '#059669' : isError ? '#dc2626' : '#6366f1',
                  border: 'none',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Explore Description 📖
              </button>
            )}
            <button
              onClick={() => setToastNotification(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '1.1rem',
                cursor: 'pointer',
                marginLeft: '0.2rem',
              }}
            >
              ✕
            </button>
          </div>
        );
      })()}

      {/* Top Header Bar */}
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

        {/* Global Metrics Bar */}
        <div className="metrics-bar">
          <div className="metric-pill">
            <span className="metric-pill-label">Total Tokens</span>
            <span className="metric-pill-value highlight-amber">{grandTotalTokens.toLocaleString()}</span>
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

      {/* Main 3-Column Workspace */}
      <div className="main-workspace">
        {/* Left Column: Sessions List */}
        <aside className="sidebar-sessions">
          <div className="sidebar-header">
            <button className="btn-new-chat" onClick={handleCreateSession}>
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
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                No sessions found. Click "+ New Job Search" to start.
              </div>
            ) : (
              filteredSessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${session.id === activeSessionId ? 'active' : ''}`}
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <div className="session-item-top">
                    <span className="session-title">{session.title}</span>
                    <button
                      className="btn-delete-session"
                      title="Delete Session"
                      onClick={(e) => handleDeleteSession(e, session.id)}
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

        {/* Center Column: Agent Conversation Screen */}
        <main className="center-chat-area">
          <div className="chat-header">
            <div>
              <div className="chat-header-title">
                💬 {activeSession ? activeSession.title : 'Select or Start a Session'}
              </div>
              <div className="chat-header-sub">
                {activeSessionId ? `Session ID: ${activeSessionId.slice(0, 18)}...` : 'AI Multi-Turn Conversation'}
              </div>
            </div>
            {activeSession && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="brand-tag" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7' }}>
                  {activeJobIds.length} Job IDs
                </span>
              </div>
            )}
          </div>

          <div className="messages-container">
            {!activeSession || activeSession.messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🤖</div>
                <div className="empty-title">Job Scraper Assistant</div>
                <div className="empty-subtitle">
                  Ask me to search for jobs (e.g. Python Developer, AI Engineer in Deloitte, Accenture, TCS).
                  I will fetch job details, extract job IDs, track tokens & latency, and stream events via Centrifugo.
                </div>
              </div>
            ) : (
              activeSession.messages.map((msg) => (
                <div key={msg.id} className={`message-bubble ${msg.role}`}>
                  <div className={`message-avatar ${msg.role}`}>
                    {msg.role === 'user' ? 'U' : 'AI'}
                  </div>
                  <div className="message-content-wrapper">
                    <div className="message-body">{msg.content}</div>

                    {/* Render extracted Job IDs tags if present */}
                    {msg.job_ids && msg.job_ids.length > 0 && (
                      <div className="job-tags-container">
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: '100%' }}>
                          📌 Extracted Job IDs (Click to Select / HITL):
                        </span>
                        {msg.job_ids.map((jid, idx) => {
                          const isSelected = selectedJobIds.includes(jid);
                          return (
                            <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                              <span
                                className={`job-id-pill ${isSelected ? 'active' : ''}`}
                                style={{
                                  cursor: 'pointer',
                                  background: isSelected ? 'rgba(139, 92, 246, 0.35)' : undefined,
                                  borderColor: isSelected ? '#a855f7' : undefined,
                                  color: isSelected ? '#f3e8ff' : undefined,
                                  transform: isSelected ? 'scale(1.05)' : undefined,
                                  transition: 'all 0.2s ease',
                                }}
                                onClick={() => toggleJobSelection(jid)}
                                title={isSelected ? 'Click to deselect' : 'Click to select Job ID for HITL'}
                              >
                                {isSelected ? '✅ ' : '🏷️ '} {jid}
                              </span>
                              <button
                                style={{
                                  background: 'rgba(255, 255, 255, 0.08)',
                                  border: '1px solid rgba(255, 255, 255, 0.15)',
                                  color: '#c084fc',
                                  borderRadius: '4px',
                                  padding: '0.15rem 0.4rem',
                                  fontSize: '0.65rem',
                                  cursor: 'pointer',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openJobModal(jid);
                                }}
                                title="Explore Job Description"
                              >
                                📖 Details
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

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
                                  {isSelected ? '✓ ' : ''}{cardJid}
                                </span>
                              </div>
                              <div className="job-card-company">🏢 {job.company || 'Top MNC'}</div>
                              <div className="job-card-detail" style={{ justifyContent: 'space-between' }}>
                                <span>📍 {job.location || 'India / Remote'} • 💼 {job.experience || '2-5 yrs'}</span>
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
                                    setActiveModalJobId(cardJid);
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

            {/* ATS Generation Progress Loading Banner */}
            {isGeneratingResumes && (
              <div className="event-badge" style={{ background: 'rgba(139, 92, 246, 0.2)', borderColor: '#8b5cf6' }}>
                <span className="event-badge-dot" style={{ background: '#a855f7' }}></span>
                <span>⚡ {atsProgressStatus || 'Running ATS Data Modifier LLM & generating resume PDFs...'}</span>
              </div>
            )}

            {/* ATS Generation Completion Card */}
            {generatedAtsResults.length > 0 && (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10b981',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '1rem',
                  color: '#ecfdf5',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    🎉 Generated ATS Tailored Resumes ({generatedAtsResults.length})
                  </span>
                  <button
                    onClick={() => setGeneratedAtsResults([])}
                    style={{ background: 'transparent', border: 'none', color: '#6ee7b7', cursor: 'pointer' }}
                  >
                    ✕ Dismiss
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
                  {generatedAtsResults.map((res: any, idx: number) => (
                    <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '6px' }}>
                      <div>📌 <strong>Job ID:</strong> {res.job_id}</div>
                      <div>📄 <strong>Generated JSON:</strong> <code>user_data/{res.generated_json_file}</code></div>
                      <div>📂 <strong>Output PDF Folder:</strong> <code>{res.output_pdf_folder}</code></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="chat-input-area">
            {/* Human-in-the-Loop (HITL) Job Selection Action Banner */}
            {selectedJobIds.length > 0 && (
              <div
                className="hitl-selection-bar"
                style={{
                  background: 'rgba(139, 92, 246, 0.18)',
                  border: '1px solid #8b5cf6',
                  borderRadius: '10px',
                  padding: '0.6rem 1rem',
                  marginBottom: '0.6rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#e9d5ff',
                  boxShadow: '0 4px 15px rgba(139, 92, 246, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.1rem' }}>🤝</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Human-in-the-Loop (HITL) Selection</div>
                    <div style={{ fontSize: '0.78rem', color: '#c084fc' }}>
                      {selectedJobIds.length} Job ID{selectedJobIds.length > 1 ? 's' : ''} selected: <strong>{selectedJobIds.join(', ')}</strong>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedJobIds([])}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#94a3b8',
                      borderRadius: '6px',
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleSubmitSelectedJobs}
                    disabled={isLoading || isGeneratingResumes}
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '6px',
                      padding: '0.4rem 0.9rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Confirm & Send Selection ➔
                  </button>
                  <button
                    onClick={() => handleGenerateATSResumes()}
                    disabled={isLoading || isGeneratingResumes}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '6px',
                      padding: '0.4rem 0.9rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🚀 Generate ATS Resumes & PDFs
                  </button>
                </div>
              </div>
            )}

            <div className="pills-bar">
              <button
                className="prompt-pill"
                onClick={() => handleSendMessage('Search Python Developer jobs in Deloitte and Accenture for 2-4 yrs experience')}
              >
                🔍 Python in Deloitte & Accenture
              </button>
              <button
                className="prompt-pill"
                onClick={() => handleSendMessage('Find AI Engineer jobs in TCS, Infosys, Wipro posted in past 7 days')}
              >
                🤖 AI Engineer past 7 days
              </button>
              <button
                className="prompt-pill"
                onClick={() => handleSendMessage('Show me top tier-1 MNC job IDs for Fullstack Engineer')}
              >
                💼 Tier-1 MNC Fullstack
              </button>
            </div>

            <div className="input-box-wrapper">
              <input
                type="text"
                className="chat-input"
                placeholder="Ask agent for jobs (e.g. Python Developer past 7 days in Accenture)..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button
                className="btn-send"
                disabled={isLoading || !inputMessage.trim()}
                onClick={() => handleSendMessage()}
              >
                Send ➔
              </button>
            </div>
          </div>
        </main>

        {/* Right Column: Telemetry & Job Showcase Panel */}
        <aside className="right-telemetry-panel">
          <div className="panel-header">
            <span>📡 Telemetry & Jobs Showcase</span>
          </div>

          <div className="panel-section">
            <span className="panel-section-title">Session Performance Metrics</span>
            <div className="metric-grid">
              <div className="metric-tile">
                <span className="metric-tile-label">Active Tokens</span>
                <span className="metric-tile-val">{activeSessionTokens.toLocaleString()}</span>
              </div>
              <div className="metric-tile">
                <span className="metric-tile-label">Latency</span>
                <span className="metric-tile-val" style={{ color: '#34d399' }}>
                  {activeSessionTimeSec}s
                </span>
              </div>
              <div className="metric-tile">
                <span className="metric-tile-label">Messages</span>
                <span className="metric-tile-val" style={{ color: '#c084fc' }}>
                  {activeSession?.messages.length || 0}
                </span>
              </div>
              <div className="metric-tile">
                <span className="metric-tile-label">Job IDs</span>
                <span className="metric-tile-val" style={{ color: '#fbbf24' }}>
                  {activeJobIds.length}
                </span>
              </div>
            </div>
          </div>

          {/* Discovered Job IDs List with Filter & Interactive Selection */}
          <div className="panel-section" style={{ flex: '0 0 auto', maxHeight: '220px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span className="panel-section-title">Extracted Job IDs ({activeJobIds.length})</span>
              {activeJobIds.length > 0 && (
                <button
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#c084fc',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                  onClick={() => {
                    if (selectedJobIds.length === activeJobIds.length) {
                      setSelectedJobIds([]);
                    } else {
                      setSelectedJobIds([...activeJobIds]);
                    }
                  }}
                >
                  {selectedJobIds.length === activeJobIds.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {activeJobIds.length > 0 && (
              <div style={{ marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Filter Job IDs..."
                  value={jobFilterText}
                  onChange={(e) => setJobFilterText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.3rem 0.5rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '0.75rem',
                  }}
                />
              </div>
            )}

            {activeJobIds.length === 0 ? (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                No job IDs captured in this session yet.
              </span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {activeJobIds
                  .filter((jid) => jid.toLowerCase().includes(jobFilterText.toLowerCase()))
                  .map((jid, idx) => {
                    const isSelected = selectedJobIds.includes(jid);
                    return (
                      <span
                        key={idx}
                        className={`job-id-pill ${isSelected ? 'active' : ''}`}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(139, 92, 246, 0.35)' : undefined,
                          borderColor: isSelected ? '#a855f7' : undefined,
                          color: isSelected ? '#f3e8ff' : undefined,
                          transition: 'all 0.2s ease',
                        }}
                        onClick={() => toggleJobSelection(jid)}
                      >
                        {isSelected ? '✅ ' : '🏷️ '} {jid}
                      </span>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Processed Session Jobs List (Persistent & Attached to Session) */}
          <div className="panel-section" style={{ flex: '0 0 auto', maxHeight: '260px', overflowY: 'auto' }}>
            <span className="panel-section-title">📋 Processed Session Jobs ({sessionJobDescriptions.length})</span>
            {sessionJobDescriptions.length === 0 ? (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.4rem' }}>
                No processed job descriptions attached to this session yet.
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
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
          <div className="panel-section" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <span className="panel-section-title">Centrifugo Real-time Event Stream</span>
            <div className="events-stream">
              {liveEvents.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
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
      </div>

      {/* 3-Step Statewise Job Details Modal */}
      {activeModalJobId && (() => {
        const modalAtsResult = generatedAtsResults.find((r) => r.job_id === activeModalJobId);
        const hasJson = Boolean(modalAtsResult?.generated_json_file || modalAtsResult?.generated_data);
        const hasPdf = Boolean(modalAtsResult?.output_pdf_folder);

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
            }}
            onClick={() => setActiveModalJobId(null)}
          >
            <div
              style={{
                backgroundColor: '#1e1e2e',
                border: '1px solid #8b5cf6',
                borderRadius: '16px',
                maxWidth: '850px',
                width: '100%',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 50px rgba(139, 92, 246, 0.3)',
                overflow: 'hidden',
                color: '#e2e8f0',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '1.2rem 1.5rem',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>📖</span>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: 600 }}>
                      {jobDescriptionsMap[activeModalJobId]?.title || `Job ID: ${activeModalJobId}`}
                    </h3>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#c084fc', marginTop: '0.2rem' }}>
                    🏢 {jobDescriptionsMap[activeModalJobId]?.company_name || 'Top MNC'} • 📍 {jobDescriptionsMap[activeModalJobId]?.location || 'India / Remote'}
                  </div>
                </div>
                <button
                  onClick={() => setActiveModalJobId(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* 3-Step Tab Navigation Bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0,0,0,0.2)' }}>
                <button
                  onClick={() => setModalActiveTab('summary')}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: modalActiveTab === 'summary' ? 'rgba(139, 92, 246, 0.25)' : 'transparent',
                    border: 'none',
                    borderBottom: modalActiveTab === 'summary' ? '2px solid #8b5cf6' : 'none',
                    color: modalActiveTab === 'summary' ? '#f8fafc' : '#94a3b8',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Step 1: 💡 Summary & JD
                </button>
                <button
                  onClick={() => {
                    if (hasJson) setModalActiveTab('json');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: modalActiveTab === 'json' ? 'rgba(139, 92, 246, 0.25)' : 'transparent',
                    border: 'none',
                    borderBottom: modalActiveTab === 'json' ? '2px solid #8b5cf6' : 'none',
                    color: hasJson ? (modalActiveTab === 'json' ? '#f8fafc' : '#c084fc') : '#64748b',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: hasJson ? 'pointer' : 'not-allowed',
                  }}
                >
                  Step 2: 📄 Generated ATS JSON {hasJson ? '✅' : '🔒'}
                </button>
                <button
                  onClick={() => {
                    if (hasPdf) setModalActiveTab('pdf');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: modalActiveTab === 'pdf' ? 'rgba(139, 92, 246, 0.25)' : 'transparent',
                    border: 'none',
                    borderBottom: modalActiveTab === 'pdf' ? '2px solid #8b5cf6' : 'none',
                    color: hasPdf ? (modalActiveTab === 'pdf' ? '#f8fafc' : '#10b981') : '#64748b',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: hasPdf ? 'pointer' : 'not-allowed',
                  }}
                >
                  Step 3: 📂 PDF Resume Output {hasPdf ? '🎉' : '🔒'}
                </button>
              </div>

              {/* Modal Step Content Body */}
              <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                {/* STEP 1: Summary & Details View */}
                {modalActiveTab === 'summary' && (
                  <>
                    {jobDescriptionsMap[activeModalJobId]?.skills_required?.length > 0 && (
                      <div>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          ⚡ Skills Required
                        </h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {jobDescriptionsMap[activeModalJobId].skills_required.map((skill: string, idx: number) => (
                            <span
                              key={idx}
                              style={{
                                background: 'rgba(139, 92, 246, 0.2)',
                                border: '1px solid rgba(139, 92, 246, 0.4)',
                                color: '#ddd6fe',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                              }}
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {jobDescriptionsMap[activeModalJobId]?.minimal_description && (
                      <div>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          💡 Minimal Summary
                        </h4>
                        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '1rem', fontSize: '0.88rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: '#e2e8f0' }}>
                          {jobDescriptionsMap[activeModalJobId].minimal_description}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        📝 Full Job Description
                      </h4>
                      <div style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '1rem', fontSize: '0.85rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: '#cbd5e1', maxHeight: '240px', overflowY: 'auto' }}>
                        {jobDescriptionsMap[activeModalJobId]?.raw_description || 'No raw job description cached yet.'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      {jobDescriptionsMap[activeModalJobId]?.job_url && (
                        <a
                          href={jobDescriptionsMap[activeModalJobId].job_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#8b5cf6', fontSize: '0.82rem', textDecoration: 'underline' }}
                        >
                          🔗 Original LinkedIn Job ↗
                        </a>
                      )}
                      <button
                        disabled={isGeneratingResumes}
                        onClick={async () => {
                          if (activeModalJobId) {
                            await handleGenerateATSResumes([activeModalJobId]);
                            setModalActiveTab('json');
                          }
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          border: 'none',
                          color: '#fff',
                          borderRadius: '6px',
                          padding: '0.5rem 1.1rem',
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          cursor: isGeneratingResumes ? 'not-allowed' : 'pointer',
                        }}
                      >
                        ⚙️ Process Job with ATS LLM & Generate PDF
                      </button>
                    </div>
                  </>
                )}

                {/* STEP 2: Generated ATS JSON View */}
                {modalActiveTab === 'json' && (
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      📄 Generated Tailored ATS Candidate JSON
                    </h4>
                    {hasJson ? (
                      <>
                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', color: '#6ee7b7', marginBottom: '0.8rem' }}>
                          ✅ ATS Candidate JSON generated successfully. Saved in <code>user_data/{modalAtsResult?.generated_json_file}</code>
                        </div>
                        <pre style={{ background: 'rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '1rem', fontSize: '0.8rem', maxHeight: '350px', overflowY: 'auto', color: '#a7f3d0' }}>
                          {JSON.stringify(modalAtsResult?.generated_data, null, 2)}
                        </pre>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                          <button
                            onClick={() => setModalActiveTab('pdf')}
                            style={{
                              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '6px',
                              padding: '0.4rem 0.9rem',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            View Output PDF Path ➔
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                        🔒 ATS Candidate JSON not generated yet for this job.
                        <div style={{ marginTop: '1rem' }}>
                          <button
                            onClick={() => setModalActiveTab('summary')}
                            style={{
                              background: '#8b5cf6',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '6px',
                              padding: '0.4rem 0.8rem',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                            }}
                          >
                            Go to Step 1 & Click Process ➔
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 3: PDF Resume Output Path View */}
                {modalActiveTab === 'pdf' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      📂 Generated PDF Resume Output & Regeneration
                    </h4>

                    {/* Session ID & PDF Regeneration Control Box */}
                    <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(139, 92, 246, 0.3)', padding: '1rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#c084fc' }}>
                        🏷️ Session Identifier for PDF Management
                      </label>
                      <div style={{ display: 'flex', gap: '0.6rem' }}>
                        <input
                          type="text"
                          value={modalSessionIdInput}
                          onChange={(e) => setModalSessionIdInput(e.target.value)}
                          placeholder="Enter session ID (e.g. session_123)"
                          style={{
                            flex: 1,
                            padding: '0.5rem 0.8rem',
                            background: 'rgba(0, 0, 0, 0.4)',
                            border: '1px solid rgba(139, 92, 246, 0.4)',
                            borderRadius: '6px',
                            color: '#f8fafc',
                            fontSize: '0.85rem',
                          }}
                        />
                        <button
                          disabled={isRegeneratingPdf}
                          onClick={handleRegeneratePdfForModal}
                          style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            border: 'none',
                            color: '#fff',
                            borderRadius: '6px',
                            padding: '0.5rem 1rem',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: isRegeneratingPdf ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isRegeneratingPdf ? '⏳ Regenerating...' : '🔄 Regenerate & Save PDFs'}
                        </button>
                      </div>
                      <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>
                        Modify session ID if desired and click Regenerate to re-compile all HTML resume templates into PDF outputs.
                      </span>
                    </div>

                    {hasPdf ? (
                      <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: '10px', padding: '1.2rem', color: '#ecfdf5', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#34d399' }}>
                          🎉 PDF Resume Compiled & Saved!
                        </div>
                        <div style={{ fontSize: '0.85rem' }}>
                          📍 <strong>Output Folder Path:</strong>
                          <div style={{ background: 'rgba(0, 0, 0, 0.4)', padding: '0.6rem 0.8rem', borderRadius: '6px', marginTop: '0.3rem', fontFamily: 'monospace', color: '#a7f3d0' }}>
                            {modalAtsResult?.output_pdf_folder || `output/resume_${activeModalJobId}`}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
                          📄 <strong>Resume PDF Files Rendered:</strong>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.4rem', color: '#93c5fd' }}>
                            <span>• <code>resume_{activeModalJobId}_resume_template.pdf</code></span>
                            <span>• <code>resume_{activeModalJobId}_colored_accent_template.pdf</code></span>
                            <span>• <code>resume_{activeModalJobId}_modern_minimal_template.pdf</code></span>
                            <span>• <code>resume_{activeModalJobId}_professional_thin_template.pdf</code></span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                        🔒 PDF Resume output not generated yet.
                        <div style={{ marginTop: '1rem' }}>
                          <button
                            onClick={handleRegeneratePdfForModal}
                            disabled={isRegeneratingPdf}
                            style={{
                              background: '#8b5cf6',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '6px',
                              padding: '0.5rem 1rem',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            🔄 Generate & Save PDFs Now ➔
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Home;