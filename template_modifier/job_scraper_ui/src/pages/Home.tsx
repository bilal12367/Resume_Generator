import React, { useState, useEffect, useRef } from 'react';




import { Header } from '../components/Header';
import { ToastNotification } from '../components/ToastNotification';
import type { ToastData } from '../components/ToastNotification';
import { JobModal } from '../components/JobModal';
import { DirectJdScreen } from '../components/DirectJdScreen';
import { SidebarSessions } from '../components/SidebarSessions';
import type { SessionItem } from '../components/SidebarSessions';
import { ChatWorkspace } from '../components/ChatWorkspace';
import { RightShowcasePanel } from '../components/RightShowcasePanel';
import { centrifugoService } from '../services/centrifugoClient';
import type { CentrifugoEvent } from '../services/centrifugoClient';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8080';

export const Home: React.FC = () => {
  // Session & Chat State
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [wsStatusText, setWsStatusText] = useState<string>('Disconnected');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [liveEvents, setLiveEvents] = useState<CentrifugoEvent[]>([]);

  // Main Navigation Screen Tab & Direct JD state
  const [mainActiveTab, setMainActiveTab] = useState<'scraper' | 'direct_jd'>('scraper');
  const [directJdTitle, setDirectJdTitle] = useState<string>('');
  const [directJdCompany, setDirectJdCompany] = useState<string>('');
  const [directJdSessionId, setDirectJdSessionId] = useState<string>('');
  const [directJdText, setDirectJdText] = useState<string>('');
  const [isProcessingDirectJd, setIsProcessingDirectJd] = useState<boolean>(false);
  const [directJdResult, setDirectJdResult] = useState<any | null>(null);

  // Job Description Explorer & ATS Resume Generation state
  const [jobDescriptionsMap, setJobDescriptionsMap] = useState<Record<string, any>>({});
  const [sessionJobDescriptions, setSessionJobDescriptions] = useState<any[]>([]);
  const [activeModalJobId, setActiveModalJobId] = useState<string | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'summary' | 'json' | 'pdf'>('summary');
  const [modalSessionIdInput, setModalSessionIdInput] = useState<string>('');
  const [isRegeneratingPdf, setIsRegeneratingPdf] = useState<boolean>(false);
  const [isGeneratingResumes, setIsGeneratingResumes] = useState<boolean>(false);
  const [_atsProgressStatus, setAtsProgressStatus] = useState<string>('');
  const [generatedAtsResults, setGeneratedAtsResults] = useState<any[]>([]);
  const [toastNotification, setToastNotification] = useState<ToastData | null>(null);

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

  // Submit selected Job IDs to agent
  const handleSubmitSelectedJobs = () => {
    if (selectedJobIds.length === 0) return;
    const prompt = `I select the following Job IDs to process: ${selectedJobIds.join(', ')}. Please proceed with these jobs.`;
    setSelectedJobIds([]);
    handleSendMessage(prompt);
  };

  // Fetch all sessions from backend
  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && Array.isArray(data.sessions)) {
          setSessions(data.sessions);
          if (!activeSessionId && data.sessions.length > 0) {
            setActiveSessionId(data.sessions[0].id);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch sessions from server:', e);
    }
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

  // Trigger ATS Resume Generation workflow for selected Job IDs
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

  // Process raw Job Description directly from text input
  const handleProcessDirectJd = async () => {
    if (!directJdText.trim() || isProcessingDirectJd) return;
    setIsProcessingDirectJd(true);
    setDirectJdResult(null);
    try {
      const res = await fetch(`${API_BASE}/process-direct-jd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: directJdSessionId.trim() || activeSessionId || 'default',
          job_title: directJdTitle.trim(),
          company: directJdCompany.trim(),
          job_description: directJdText.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          setDirectJdResult(data);
          setToastNotification({
            message: `🎉 Direct Job Description processed & PDFs generated for ${data.job_id}!`,
            type: 'success',
          });
        }
      } else {
        const err = await res.json();
        setToastNotification({
          message: `⚠️ Error processing JD: ${err.detail || 'Failed to process'}`,
          type: 'error',
        });
      }
    } catch (e: any) {
      console.error('Failed to process direct JD:', e);
      setToastNotification({
        message: `⚠️ Connection error: ${e.message}`,
        type: 'error',
      });
    } finally {
      setIsProcessingDirectJd(false);
    }
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

  // Centrifugo live listener for job descriptions & ATS events
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
            const existingMap = new Map(prev.map((item) => [item.job_id || item.id, item]));
            jobs.forEach((j) => existingMap.set(j.job_id || j.id, j));
            return Array.from(existingMap.values());
          });

          setToastNotification({
            message: `📋 Processed ${jobs.length} Job Description${jobs.length > 1 ? 's' : ''}!`,
            jobId: jobs[0]?.job_id || jobs[0]?.id,
            type: 'info',
          });
        }
      }

      if (anyEvt.event_type === 'ats_generation_progress') {
        setAtsProgressStatus(anyEvt.message || 'Processing ATS Resume Workflow...');
      }

      if (anyEvt.event_type === 'ats_generation_completed') {
        const results = anyEvt.results || [];
        if (Array.isArray(results) && results.length > 0) {
          setGeneratedAtsResults((prev) => {
            const map = new Map(prev.map((r) => [r.job_id, r]));
            results.forEach((r: any) => map.set(r.job_id, r));
            return Array.from(map.values());
          });
          setToastNotification({
            message: `🎉 ATS Resume Generation completed for ${results.length} jobs!`,
            jobId: results[0]?.job_id,
            type: 'success',
          });
        }
        setIsGeneratingResumes(false);
        setAtsProgressStatus('');
      }
    });
  }, []);

  const handleCreateSession = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Job Search #${sessions.length + 1}` }),
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

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (activeSessionId === id) {
          const remaining = sessions.filter((s) => s.id !== id);
          setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputMessage;
    if (!textToSend.trim() || isLoading) return;

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        const res = await fetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: textToSend.slice(0, 30) }),
        });
        if (res.ok) {
          const data = await res.json();
          targetSessionId = data.session.id;
          setSessions((prev) => [data.session, ...prev]);
          setActiveSessionId(targetSessionId);
        }
      } catch (e) {
        console.error('Failed to auto-create session:', e);
        return;
      }
    }

    const userMsg = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: textToSend,
      timestamp: new Date().toISOString(),
    };

    setSessions((prev) =>
      prev.map((s) =>
        s.id === targetSessionId ? { ...s, messages: [...s.messages, userMsg] } : s
      )
    );

    if (!customPrompt) setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: targetSessionId,
          message: textToSend,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.reply) {
          const assistantMsg = {
            id: (Date.now() + 1).toString(),
            role: 'assistant' as const,
            content: data.reply.content,
            timestamp: data.reply.timestamp || new Date().toISOString(),
            tokens: data.metrics?.tokens,
            time_taken_ms: data.metrics?.time_taken_ms,
            extracted_jobs: data.metrics?.extracted_jobs || [],
            jobs: data.metrics?.jobs || [],
          };

          setSessions((prev) =>
            prev.map((s) => {
              if (s.id === targetSessionId) {
                const updatedMsg = [...s.messages, assistantMsg];
                const updatedTokens = (s.total_tokens || 0) + (data.metrics?.tokens || 0);
                const updatedTime = (s.total_time_ms || 0) + (data.metrics?.time_taken_ms || 0);
                const existingJobIds = s.job_ids || [];
                const newJobIds = data.metrics?.extracted_jobs || [];
                const mergedJobIds = Array.from(new Set([...existingJobIds, ...newJobIds]));

                return {
                  ...s,
                  messages: updatedMsg,
                  total_tokens: updatedTokens,
                  total_time_ms: updatedTime,
                  job_ids: mergedJobIds,
                };
              }
              return s;
            })
          );
        }
      }
    } catch (e: any) {
      console.error('Failed to send message:', e);
    } finally {
      setIsLoading(false);
      fetchSessions();
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const grandTotalTokens = sessions.reduce((acc, s) => acc + (s.total_tokens || 0), 0);
  const activeSessionTokens = activeSession?.total_tokens || 0;
  const activeSessionTimeSec = ((activeSession?.total_time_ms || 0) / 1000).toFixed(2);
  const activeJobIds = activeSession?.job_ids || [];

  return (
    <div className="app-container">
      {/* Toast Notification Banner */}
      <ToastNotification
        toast={toastNotification}
        onClose={() => setToastNotification(null)}
        onOpenJobModal={openJobModal}
      />

      {/* Header with Nav Tabs & Metrics */}
      <Header
        grandTotalTokens={grandTotalTokens}
        activeSessionTokens={activeSessionTokens}
        activeSessionTimeSec={activeSessionTimeSec}
        wsConnected={wsConnected}
        wsStatusText={wsStatusText}
        mainActiveTab={mainActiveTab}
        setMainActiveTab={setMainActiveTab}
        directJdSessionId={directJdSessionId}
        setDirectJdSessionId={setDirectJdSessionId}
        activeSessionId={activeSessionId}
      />

      {mainActiveTab === 'direct_jd' ? (
        /* Direct Job Description Screen View */
        <DirectJdScreen
          directJdTitle={directJdTitle}
          setDirectJdTitle={setDirectJdTitle}
          directJdCompany={directJdCompany}
          setDirectJdCompany={setDirectJdCompany}
          directJdSessionId={directJdSessionId}
          setDirectJdSessionId={setDirectJdSessionId}
          directJdText={directJdText}
          setDirectJdText={setDirectJdText}
          isProcessingDirectJd={isProcessingDirectJd}
          directJdResult={directJdResult}
          onProcessDirectJd={handleProcessDirectJd}
          apiBase={API_BASE}
        />
      ) : (
        /* 3-Column Agent Job Scraper Workspace */
        <div className="main-workspace">
          {/* Left Column: Sessions Sidebar */}
          <SidebarSessions
            filteredSessions={filteredSessions}
            activeSessionId={activeSessionId}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onCreateSession={handleCreateSession}
            onSelectSession={setActiveSessionId}
            onDeleteSession={handleDeleteSession}
          />

          {/* Center Column: Chat Messages Timeline Workspace */}
          <ChatWorkspace
            activeSession={activeSession}
            activeSessionId={activeSessionId}
            isLoading={isLoading}
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            selectedJobIds={selectedJobIds}
            toggleJobSelection={toggleJobSelection}
            openJobModal={openJobModal}
            onSubmitSelectedJobs={handleSubmitSelectedJobs}
            onSendMessage={handleSendMessage}
            messagesEndRef={messagesEndRef}
          />

          {/* Right Column: Workflow Control Panel & Live Stream */}
          <RightShowcasePanel
            selectedJobIds={selectedJobIds}
            activeJobIds={activeJobIds}
            sessionJobDescriptions={sessionJobDescriptions}
            toggleJobSelection={toggleJobSelection}
            openJobModal={openJobModal}
            setSelectedJobIds={setSelectedJobIds}
            liveEvents={liveEvents}
          />
        </div>
      )}

      {/* 3-Step Statewise Job Details Modal */}
      <JobModal
        activeModalJobId={activeModalJobId}
        onClose={() => setActiveModalJobId(null)}
        jobDescriptionsMap={jobDescriptionsMap}
        generatedAtsResults={generatedAtsResults}
        modalActiveTab={modalActiveTab}
        setModalActiveTab={setModalActiveTab}
        modalSessionIdInput={modalSessionIdInput}
        setModalSessionIdInput={setModalSessionIdInput}
        isRegeneratingPdf={isRegeneratingPdf}
        onRegeneratePdf={handleRegeneratePdfForModal}
        isGeneratingResumes={isGeneratingResumes}
        onGenerateATSResumes={handleGenerateATSResumes}
      />
    </div>
  );
};

export default Home;