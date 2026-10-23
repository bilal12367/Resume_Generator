import React, { useState, useEffect, useRef } from 'react';
import { CentrifugoClient } from '../services/CentrifugoClient';

interface UserProfile {
  id: number;
  profile_name: string;
  user_data: string;
}

interface SavedJob {
  job_id: string;
  title: string;
  company_name: string;
  location: string;
  job_source?: string;
  job_url?: string;
}

interface WorkflowSession {
  session_id: string;
  title: string;
  status: 'CREATED' | 'QUEUED' | 'ATS_GENERATING' | 'ATS_COMPLETED' | 'PDF_GENERATING' | 'PDF_COMPLETED' | 'FAILED';
  profile_id?: number;
  job_id?: string;
  batch_id?: string;
  batch_title?: string;
  job_source?: string;
  job_url?: string;
  pdf_filename?: string;
  pdf_links?: Array<{ template_name: string; filename: string; url: string }>;
  error_message?: string;
  total_tokens?: number;
  processing_time_seconds?: number;
  created_at?: string;
  updated_at?: string;
  generated_ats?: {
    id: number;
    profile_id: number;
    job_id: string;
    ats_data_parsed: any;
    created_at?: string;
  };
}

interface WorkflowBatch {
  batch_id: string;
  batch_title: string;
  total_jobs: number;
  completed_jobs: number;
  status: string;
  total_tokens?: number;
  processing_time_seconds?: number;
  last_updated?: string;
}

interface WorkflowPageProps {
  API_BASE_URL: string;
  onOpenJobModal: (jobId: string, jobSource?: string, jobUrl?: string) => void;
  initialSessionId?: string;
  selectedJobsList?: any[];
  onClearSelectedJobs?: () => void;
}

export const WorkflowPage: React.FC<WorkflowPageProps> = ({
  API_BASE_URL,
  onOpenJobModal,
  initialSessionId,
  selectedJobsList,
  onClearSelectedJobs,
}) => {
  // Workflow Sessions State
  const [sessions, setSessions] = useState<WorkflowSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(initialSessionId || '');
  const [activeSession, setActiveSession] = useState<WorkflowSession | null>(null);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Batch Processing State
  const [batches, setBatches] = useState<WorkflowBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string>('');
  const [batchProfileId, setBatchProfileId] = useState<string>('');
  const [runningBatchATS, setRunningBatchATS] = useState<boolean>(false);
  const centrifugoRef = useRef<CentrifugoClient | null>(null);

  // Available Data Dropdowns
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);

  // Workflow Form State
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [customJobId, setCustomJobId] = useState<string>('');
  const [pdfFilename, setPdfFilename] = useState<string>('');
  const [selectedPdfIndex, setSelectedPdfIndex] = useState<number>(0);

  // Processing States
  const [runningATS, setRunningATS] = useState<boolean>(false);
  const [generatingPDFs, setGeneratingPDFs] = useState<boolean>(false);
  const [showRawATSJson, setShowRawATSJson] = useState<boolean>(false);

  // Editable ATS JSON State
  const [editedAtsJsonText, setEditedAtsJsonText] = useState<string>('');
  const [savingAtsJson, setSavingAtsJson] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Sub-Tab Navigation: 'session' | 'manual' | 'batch'
  const [activeTab, setActiveTab] = useState<'session' | 'manual' | 'batch'>('session');

  // Manual Free Text Workflow State
  const [manualProfileId, setManualProfileId] = useState<string>('');
  const [manualCustomUserData, setManualCustomUserData] = useState<string>('');
  const [manualJobTitle, setManualJobTitle] = useState<string>('');
  const [manualJobDescription, setManualJobDescription] = useState<string>('');

  // Sync active session's parsed ATS JSON into editor state
  useEffect(() => {
    if (activeSession?.generated_ats?.ats_data_parsed) {
      setEditedAtsJsonText(JSON.stringify(activeSession.generated_ats.ats_data_parsed, null, 2));
    } else {
      setEditedAtsJsonText('');
    }
  }, [activeSession?.generated_ats?.ats_data_parsed]);

  // Handler to Save Modified ATS JSON to Backend DB
  const handleSaveATSJson = async () => {
    if (!activeSessionId) return;
    let parsed: any;
    try {
      parsed = JSON.parse(editedAtsJsonText);
    } catch (err: any) {
      alert(`Invalid JSON syntax: ${err.message}`);
      return;
    }

    setSavingAtsJson(true);
    setSaveSuccessMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/sessions/${activeSessionId}/ats`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ats_data: parsed })
      });

      if (res.ok) {
        await fetchSessionDetails(activeSessionId);
        setSaveSuccessMsg("✅ Modified ATS JSON saved successfully! Generating PDFs will now use this updated JSON data.");
        setTimeout(() => setSaveSuccessMsg(null), 5000);
      } else {
        const errData = await res.json();
        alert(`Failed to save ATS JSON: ${errData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error("Save ATS JSON Error:", err);
      alert("Network error saving ATS JSON.");
    } finally {
      setSavingAtsJson(false);
    }
  };

  // Sync initialSessionId prop
  useEffect(() => {
    if (initialSessionId) {
      setActiveSessionId(initialSessionId);
    }
  }, [initialSessionId]);

  // Fetch Workflow Sessions
  const fetchSessions = async (targetId?: string) => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/sessions`);
      if (res.ok) {
        const data = await res.json();
        const list: WorkflowSession[] = data.sessions || [];
        setSessions(list);
        const preferred = targetId || initialSessionId;
        if (preferred && list.some(s => s.session_id === preferred)) {
          setActiveSessionId(preferred);
        } else if (list.length > 0 && (!activeSessionId || !list.some(s => s.session_id === activeSessionId))) {
          setActiveSessionId(list[0].session_id);
        } else if (list.length === 0) {
          handleCreateNewSession();
        }
      }
    } catch (err) {
      console.error("Failed to fetch workflow sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  // Fetch Profiles & Saved Jobs for Dropdowns
  const fetchDropdownData = async () => {
    try {
      const [profRes, linkedInRes, naukriRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/workflow/profiles`),
        fetch(`${API_BASE_URL}/api/linkedin/jobs/saved`),
        fetch(`${API_BASE_URL}/api/naukri/jobs/saved`)
      ]);
      if (profRes.ok) {
        const pData = await profRes.json();
        setProfiles(pData.profiles || []);
      }

      let combinedJobs: SavedJob[] = [];
      if (linkedInRes.ok) {
        const lData = await linkedInRes.json();
        const lJobs = (lData.jobs || []).map((j: any) => ({ ...j, job_source: j.job_source || 'linkedin' }));
        combinedJobs = [...combinedJobs, ...lJobs];
      }
      if (naukriRes.ok) {
        const nData = await naukriRes.json();
        const nJobs = (nData.jobs || []).map((j: any) => ({ ...j, job_source: j.job_source || 'naukri' }));
        combinedJobs = [...combinedJobs, ...nJobs];
      }
      setSavedJobs(combinedJobs);
    } catch (err) {
      console.error("Failed to fetch dropdown options:", err);
    }
  };

  // Fetch Workflow Batches
  const fetchBatches = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/batches`);
      if (res.ok) {
        const data = await res.json();
        const list: WorkflowBatch[] = data.batches || [];
        setBatches(list);
        if (list.length > 0 && !activeBatchId) {
          setActiveBatchId(list[0].batch_id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch workflow batches:", err);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchDropdownData();
    fetchBatches();
  }, [API_BASE_URL]);

  // Centrifugo WebSocket Connection & Real-Time Event Listener
  useEffect(() => {
    const defaultWsUrl = import.meta.env.VITE_CENTRIFUGO_WS_URL || (import.meta.env.DEV ? 'ws://localhost:8008/connection/websocket' : 'ws://localhost:8008/connection/websocket');
    const cfClient = new CentrifugoClient({
      wsUrl: defaultWsUrl,
      userId: 'user_demo',
      autoReconnect: true,
    });
    centrifugoRef.current = cfClient;

    let unsubUpdates: (() => void) | null = null;
    let unsubBatch: (() => void) | null = null;

    async function initCentrifugo() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/linkedin/centrifugo/token?user_id=user_demo`);
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            await cfClient.connect(data.token);

            // Subscribe to global batch updates channel
            unsubUpdates = cfClient.subscribe("batch:updates", () => {
              fetchSessions();
              fetchBatches();
            });

            // Subscribe to active batch channel if present
            if (activeBatchId) {
              unsubBatch = cfClient.subscribe(`batch:${activeBatchId}`, (eventRecord) => {
                const dataPayload = eventRecord.data || eventRecord;
                if (dataPayload && dataPayload.session_id && dataPayload.status) {
                  setSessions((prev) => prev.map((s) => {
                    if (s.session_id === dataPayload.session_id) {
                      return {
                        ...s,
                        status: dataPayload.status,
                        total_tokens: dataPayload.total_tokens !== undefined ? dataPayload.total_tokens : s.total_tokens,
                        processing_time_seconds: dataPayload.processing_time_seconds !== undefined ? dataPayload.processing_time_seconds : s.processing_time_seconds,
                        error_message: dataPayload.error_message || s.error_message
                      };
                    }
                    return s;
                  }));

                  if (dataPayload.session_id === activeSessionId) {
                    fetchSessionDetails(activeSessionId);
                  }
                }
              });
            }
          }
        }
      } catch (err) {
        console.error("Centrifugo connection error in WorkflowPage:", err);
      }
    }

    initCentrifugo();

    return () => {
      if (unsubUpdates) unsubUpdates();
      if (unsubBatch) unsubBatch();
      cfClient.disconnect();
    };
  }, [API_BASE_URL, activeBatchId, activeSessionId]);

  // Handle Batch ATS Execution
  const handleStartBatchWorkflow = async () => {
    if (!selectedJobsList || selectedJobsList.length === 0) {
      alert("No jobs selected in your drawer list.");
      return;
    }
    if (!batchProfileId) {
      alert("Please select a candidate profile for this batch.");
      return;
    }

    setRunningBatchATS(true);
    try {
      const payload = {
        profile_id: parseInt(batchProfileId, 10),
        jobs: selectedJobsList.map(j => ({
          job_id: j.jobId,
          title: j.title || `Job ${j.jobId}`,
          company_name: j.company || 'Company',
          job_source: j.jobSource || 'linkedin',
          job_url: j.jobUrl
        })),
        max_concurrency: 3
      };

      const res = await fetch(`${API_BASE_URL}/api/workflow/batches/run-ats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (onClearSelectedJobs) onClearSelectedJobs();
        await fetchSessions();
        await fetchBatches();
        if (data.batch_id) setActiveBatchId(data.batch_id);
        if (data.sessions && data.sessions.length > 0) {
          setActiveSessionId(data.sessions[0].session_id);
        }
        setActiveTab('batch');
      } else {
        const errData = await res.json();
        alert(`Failed to start batch workflow: ${errData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error("Batch ATS Execution Error:", err);
      alert("Network error executing batch workflow.");
    } finally {
      setRunningBatchATS(false);
    }
  };

  // Fetch Active Session Details (Stateful Persistence)
  const fetchSessionDetails = async (sessionId: string) => {
    if (!sessionId) return;
    setLoadingDetails(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/sessions/${sessionId}`);
      if (res.ok) {
        const data: WorkflowSession = await res.json();
        setActiveSession(data);
        if (data.profile_id) setSelectedProfileId(String(data.profile_id));
        if (data.job_id) setSelectedJobId(data.job_id);
        if (data.pdf_filename) setPdfFilename(data.pdf_filename);
        else if (data.profile_id && data.job_id) {
          setPdfFilename(`candidate_profile_${data.profile_id}_job_${data.job_id}`);
        }
      }
    } catch (err) {
      console.error(`Failed to load session ${sessionId}:`, err);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (activeSessionId) {
      fetchSessionDetails(activeSessionId);
    }
  }, [activeSessionId]);

  const handleCreateNewSession = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json();
        fetchSessions();
        setActiveSessionId(data.session_id);
      }
    } catch (err) {
      console.error("Failed to create workflow session:", err);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this workflow session?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const remaining = sessions.filter(s => s.session_id !== sessionId);
        setSessions(remaining);
        if (activeSessionId === sessionId) {
          if (remaining.length > 0) setActiveSessionId(remaining[0].session_id);
          else handleCreateNewSession();
        }
      }
    } catch (err) {
      console.error("Failed to delete workflow session:", err);
    }
  };

  const handleRunATSWorkflow = async () => {
    const targetJobId = selectedJobId === 'custom' ? customJobId.trim() : selectedJobId;

    if (!selectedProfileId) {
      alert("Please select a candidate user profile.");
      return;
    }
    if (!targetJobId) {
      alert("Please select or enter a target Job ID.");
      return;
    }

    setRunningATS(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/sessions/${activeSessionId}/run-ats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: parseInt(selectedProfileId, 10),
          job_id: targetJobId
        })
      });

      if (res.ok) {
        await fetchSessionDetails(activeSessionId);
        fetchSessions();
        setPdfFilename(`candidate_profile_${selectedProfileId}_job_${targetJobId}`);
      } else {
        const errData = await res.json();
        alert(`ATS Workflow Failed: ${errData.detail || 'Unknown error'}`);
        await fetchSessionDetails(activeSessionId);
      }
    } catch (err) {
      console.error("ATS Workflow Execution Error:", err);
      alert("Network error running ATS workflow.");
    } finally {
      setRunningATS(false);
    }
  };

  const handleRunManualATSWorkflow = async () => {
    if (!manualJobDescription.trim()) {
      alert("Please enter a free-text job description.");
      return;
    }
    const isCustomProfile = manualProfileId === 'custom';
    if (!manualProfileId && !manualCustomUserData.trim()) {
      alert("Please select a candidate user profile or enter custom user data.");
      return;
    }
    if (isCustomProfile && !manualCustomUserData.trim()) {
      alert("Please enter candidate resume JSON or free-text user data.");
      return;
    }

    setRunningATS(true);
    try {
      const sessionTitle = manualJobTitle.trim()
        ? `Manual JD: ${manualJobTitle.trim()}`
        : `Manual Text Workflow (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;

      const createRes = await fetch(`${API_BASE_URL}/api/workflow/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sessionTitle,
          job_id: 'MANUAL'
        })
      });

      let targetSessionId = activeSessionId;
      if (createRes.ok) {
        const createData = await createRes.json();
        targetSessionId = createData.session_id;
        setActiveSessionId(targetSessionId);
      }

      const payload: any = {
        job_description_text: manualJobDescription.trim(),
        job_id: 'MANUAL'
      };
      if (!isCustomProfile && manualProfileId) {
        payload.profile_id = parseInt(manualProfileId, 10);
      } else {
        payload.custom_user_data = manualCustomUserData.trim();
      }

      const res = await fetch(`${API_BASE_URL}/api/workflow/sessions/${targetSessionId}/run-ats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await fetchSessionDetails(targetSessionId);
        fetchSessions(targetSessionId);
        const sanitizeTitle = manualJobTitle.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        const defaultFilename = sanitizeTitle
          ? `manual_resume_${sanitizeTitle}`
          : `manual_resume_${targetSessionId.slice(-6)}`;
        setPdfFilename(defaultFilename);
      } else {
        const errData = await res.json();
        alert(`ATS Workflow Failed: ${errData.detail || 'Unknown error'}`);
        await fetchSessionDetails(targetSessionId);
      }
    } catch (err) {
      console.error("Manual ATS Workflow Error:", err);
      alert("Network error executing manual ATS workflow.");
    } finally {
      setRunningATS(false);
    }
  };

  const handleGeneratePDFs = async () => {
    if (!pdfFilename.trim()) {
      alert("Please enter a PDF filename.");
      return;
    }

    setGeneratingPDFs(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/sessions/${activeSessionId}/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: pdfFilename.trim()
        })
      });

      if (res.ok) {
        await fetchSessionDetails(activeSessionId);
        fetchSessions();
      } else {
        const errData = await res.json();
        alert(`PDF Generation Failed: ${errData.detail || 'Unknown error'}`);
        await fetchSessionDetails(activeSessionId);
      }
    } catch (err) {
      console.error("PDF Generation Error:", err);
      alert("Network error generating PDFs.");
    } finally {
      setGeneratingPDFs(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CREATED':
        return <span className="badge bg-secondary">Created</span>;
      case 'QUEUED':
        return <span className="badge bg-secondary text-white"><i className="bi bi-clock me-1"></i> Queued</span>;
      case 'ATS_GENERATING':
        return <span className="badge bg-warning text-dark"><i className="bi bi-gear spin me-1"></i> Bypassing ATS...</span>;
      case 'ATS_COMPLETED':
        return <span className="badge bg-info text-white"><i className="bi bi-check-circle me-1"></i> ATS Data Ready</span>;
      case 'PDF_GENERATING':
        return <span className="badge bg-warning text-dark"><i className="bi bi-gear spin me-1"></i> Rendering PDFs...</span>;
      case 'PDF_COMPLETED':
        return <span className="badge bg-success"><i className="bi bi-file-earmark-pdf-fill me-1"></i> PDFs Generated</span>;
      case 'FAILED':
        return <span className="badge bg-danger"><i className="bi bi-x-circle me-1"></i> Failed</span>;
      default:
        return <span className="badge bg-secondary">{status}</span>;
    }
  };

  const atsData = activeSession?.generated_ats?.ats_data_parsed;
  const interviewPoints = atsData?.personal_details?.points_to_user;

  return (
    <div className="d-flex w-100 h-100 overflow-hidden" style={{ height: 'calc(100vh - 65px)', maxHeight: 'calc(100vh - 65px)' }}>
      {/* Workflow Sessions Sidebar (Fixed 300px) */}
      <div className="bg-light border-end d-flex flex-column" style={{ width: '300px', flexShrink: 0 }}>
        <div className="p-3 border-bottom d-flex justify-content-between align-items-center bg-white">
          <h6 className="fw-bold text-dark mb-0">Workflow Sessions</h6>
          <button
            onClick={handleCreateNewSession}
            className="btn btn-sm btn-purple d-flex align-items-center gap-1"
          >
            <i className="bi bi-plus-lg"></i>
            <span>New Session</span>
          </button>
        </div>

        <div className="overflow-auto no-scrollbar flex-grow-1 p-2 d-flex flex-column gap-2">
          {loadingSessions ? (
            <div className="text-center py-4">
              <div className="spinner-border spinner-border-sm text-purple" role="status"></div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-3 text-center text-muted fs-8">No workflow sessions.</div>
          ) : (
            <>
              {/* Batch Runs Section */}
              {batches.length > 0 && (
                <div className="mb-2">
                  <div className="fs-9 fw-bold text-muted text-uppercase px-2 mb-1">
                    <i className="bi bi-layers-fill me-1 text-warning"></i> Batch Runs ({batches.length})
                  </div>
                  {batches.map((b) => (
                    <div
                      key={b.batch_id}
                      onClick={() => {
                        setActiveBatchId(b.batch_id);
                        setActiveTab('batch');
                        const bSessions = sessions.filter(s => s.batch_id === b.batch_id);
                        if (bSessions.length > 0) setActiveSessionId(bSessions[0].session_id);
                      }}
                      className={`p-2.5 mb-1 rounded-3 cursor-pointer transition-all border ${
                        activeBatchId === b.batch_id && activeTab === 'batch'
                          ? 'bg-purple-subtle border-purple shadow-sm'
                          : 'bg-white border-light hover-bg-white'
                      }`}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-1">
                        <strong className="text-purple fs-8 text-truncate me-1" style={{ maxWidth: '140px' }}>
                          {b.batch_title}
                        </strong>
                        <span className="badge bg-purple text-white fs-9">{b.completed_jobs}/{b.total_jobs}</span>
                      </div>
                      <div className="d-flex align-items-center justify-content-between text-muted fs-9">
                        <span>Status: <span className="fw-semibold text-capitalize">{b.status}</span></span>
                        {b.total_tokens ? (
                          <span className="text-purple fw-semibold"><i className="bi bi-cpu me-0.5"></i>{b.total_tokens.toLocaleString()}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Individual Sessions Section */}
              <div>
                <div className="fs-9 fw-bold text-muted text-uppercase px-2 mb-1">
                  <i className="bi bi-file-earmark-text me-1 text-primary"></i> Individual Workflows
                </div>
                {sessions.filter(s => !s.batch_id).map((sess) => (
                  <div
                    key={sess.session_id}
                    onClick={() => {
                      setActiveSessionId(sess.session_id);
                      if (activeTab === 'batch') setActiveTab('session');
                    }}
                    className={`p-2.5 mb-1 rounded-3 cursor-pointer transition-all border ${
                      activeSessionId === sess.session_id && activeTab !== 'batch'
                        ? 'bg-white shadow-sm border-purple-light'
                        : 'bg-transparent border-transparent hover-bg-white'
                    }`}
                  >
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <strong className="text-purple fs-8 text-truncate me-2" style={{ maxWidth: '150px' }}>
                        {sess.title}
                      </strong>
                      <button
                        onClick={(e) => handleDeleteSession(sess.session_id, e)}
                        className="btn btn-sm text-danger p-0 border-0"
                        title="Delete Session"
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>

                    <div className="d-flex align-items-center justify-content-between mt-1">
                      {getStatusBadge(sess.status)}
                      <small className="text-muted fs-9">
                        {sess.updated_at ? new Date(sess.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Workflow Viewport (Flex 1) */}
      <div className="d-flex flex-column h-100 bg-white overflow-auto p-4 flex-grow-1" style={{ minWidth: 0 }}>
        {activeSession ? (
          <div className="d-flex flex-column gap-4 maxWidth-xl mx-auto w-100" style={{ maxWidth: '1000px' }}>
            {/* Header Banner */}
            <div className="card-modern p-4 bg-purple-gradient text-white border-0 shadow-sm">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <h4 className="fw-bold mb-0">{activeSession.title}</h4>
                    {getStatusBadge(activeSession.status)}
                  </div>
                  <p className="mb-0 text-white-50 fs-7">
                    Session ID: <code className="text-white font-monospace">{activeSession.session_id}</code>
                  </p>
                </div>

                <button
                  onClick={() => fetchSessionDetails(activeSession.session_id)}
                  className="btn btn-light text-purple btn-sm fw-bold shadow-sm d-flex align-items-center gap-1"
                >
                  <i className={`bi bi-arrow-clockwise ${loadingDetails ? 'spin' : ''}`}></i>
                  <span>Refresh State</span>
                </button>
              </div>
            </div>

            {/* Navigation Sub-Tabs Bar */}
            <div className="d-flex align-items-center gap-2 mb-1 bg-light p-1.5 rounded-3 border">
              <button
                type="button"
                onClick={() => setActiveTab('session')}
                className={`btn btn-sm ${activeTab === 'session' ? 'btn-purple shadow-sm fw-bold' : 'btn-link text-secondary text-decoration-none'} d-flex align-items-center gap-2 px-3 py-2`}
              >
                <i className="bi bi-diagram-3-fill"></i>
                <span>Single Job Session</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className={`btn btn-sm ${activeTab === 'manual' ? 'btn-purple shadow-sm fw-bold' : 'btn-link text-secondary text-decoration-none'} d-flex align-items-center gap-2 px-3 py-2`}
              >
                <i className="bi bi-pencil-square"></i>
                <span>Manual Free-Text JD</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('batch')}
                className={`btn btn-sm ${activeTab === 'batch' ? 'btn-purple shadow-sm fw-bold' : 'btn-link text-secondary text-decoration-none'} d-flex align-items-center gap-2 px-3 py-2`}
              >
                <i className="bi bi-layers-fill text-warning"></i>
                <span>⚡ Batch Jobs Workflow {batches.length > 0 ? `(${batches.length})` : ''}</span>
              </button>
            </div>

            {/* Error Banner */}
            {activeSession.error_message && (
              <div className="alert alert-danger d-flex align-items-center gap-2 p-3 rounded-3 shadow-sm mb-0">
                <i className="bi bi-exclamation-triangle-fill fs-5"></i>
                <div>
                  <strong>Workflow Error:</strong> {activeSession.error_message}
                </div>
              </div>
            )}

            {/* Step 1 (Option A): Session & Target Job ID Configuration */}
            {activeTab === 'session' && (
              <div className="card-modern p-4 shadow-sm">
                <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                  <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <i className="bi bi-1-circle-fill text-purple fs-4"></i>
                    <span>Step 1: Select Candidate Profile & Target Job ID</span>
                  </h5>
                  {selectedJobId && selectedJobId !== 'custom' && (
                    <button
                      type="button"
                      onClick={() => {
                        const selectedJobObj = savedJobs.find((j) => j.job_id === selectedJobId);
                        onOpenJobModal(selectedJobId, selectedJobObj?.job_source, selectedJobObj?.job_url);
                      }}
                      className="btn btn-sm btn-outline-purple d-flex align-items-center gap-1"
                    >
                      <i className="bi bi-eye-fill"></i>
                      <span>Inspect Target Job</span>
                    </button>
                  )}
                </div>

                <div className="row g-3 align-items-end">
                  {/* Candidate Profile Selection */}
                  <div className="col-md-5">
                    <label className="fs-8 fw-bold text-muted mb-1 d-block">
                      Candidate User Profile (<code>user_data</code>):
                    </label>
                    <select
                      className="form-select fs-7"
                      value={selectedProfileId}
                      onChange={(e) => setSelectedProfileId(e.target.value)}
                      disabled={runningATS}
                    >
                      <option value="">-- Select Profile --</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.profile_name} (ID: {p.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Target Job ID Selection */}
                  <div className="col-md-5">
                    <label className="fs-8 fw-bold text-muted mb-1 d-block">Target Job ID (LinkedIn / Naukri):</label>
                    <select
                      className="form-select fs-7"
                      value={selectedJobId}
                      onChange={(e) => setSelectedJobId(e.target.value)}
                      disabled={runningATS}
                    >
                      <option value="">-- Select Saved Job --</option>
                      {selectedJobId && selectedJobId !== 'custom' && !savedJobs.some((j) => j.job_id === selectedJobId) && (
                        <option value={selectedJobId}>
                          Job #{selectedJobId} (Current Job)
                        </option>
                      )}
                      {savedJobs.map((j, idx) => (
                        <option key={`${j.job_source || 'job'}-${j.job_id}-${idx}`} value={j.job_id}>
                          [{j.job_source === 'naukri' ? 'Naukri' : 'LinkedIn'}] {j.title} - {j.company_name} (ID: {j.job_id})
                        </option>
                      ))}
                      <option value="custom">➕ Enter Custom Job ID...</option>
                    </select>
                  </div>

                  {/* Custom Job ID Input if selected */}
                  {selectedJobId === 'custom' && (
                    <div className="col-md-5 mt-2">
                      <input
                        type="text"
                        className="form-control fs-7"
                        placeholder="Enter Job ID (e.g. 4448338827 or Naukri ID)..."
                        value={customJobId}
                        onChange={(e) => setCustomJobId(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Start ATS Button */}
                  <div className="col-md-2">
                    <button
                      type="button"
                      onClick={handleRunATSWorkflow}
                      disabled={runningATS || !selectedProfileId || (!selectedJobId || (selectedJobId === 'custom' && !customJobId.trim()))}
                      className="btn btn-purple w-100 fw-bold fs-7 d-flex align-items-center justify-content-center gap-2"
                      style={{ height: '38px' }}
                    >
                      {runningATS ? (
                        <>
                          <div className="spinner-border spinner-border-sm text-white" role="status"></div>
                          <span>Running...</span>
                        </>
                      ) : (
                        <>
                          <i className="bi bi-play-fill fs-5"></i>
                          <span>Start ATS</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1 (Option B): Manual Free-Text Job Description Configuration */}
            {activeTab === 'manual' && (
              <div className="card-modern p-4 shadow-sm">
                <div className="mb-3 pb-2 border-bottom">
                  <h5 className="fw-bold text-dark mb-1 d-flex align-items-center gap-2">
                    <i className="bi bi-pencil-square text-purple fs-4"></i>
                    <span>Step 1: Manual Free-Text Job Description Workflow</span>
                  </h5>
                  <p className="text-muted fs-8 mb-0">
                    Paste any custom job description text and select candidate resume profile data to generate ATS tailored resume data and PDFs.
                  </p>
                </div>

                <div className="d-flex flex-column gap-3">
                  <div className="row g-3">
                    {/* Candidate User Profile Selection */}
                    <div className="col-md-6">
                      <label className="fs-8 fw-bold text-muted mb-1 d-block">
                        Candidate User Profile (<code>user_data</code>): <span className="text-danger">*</span>
                      </label>
                      <select
                        className="form-select fs-7"
                        value={manualProfileId}
                        onChange={(e) => setManualProfileId(e.target.value)}
                        disabled={runningATS}
                      >
                        <option value="">-- Select Profile --</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.profile_name} (ID: {p.id})
                          </option>
                        ))}
                        <option value="custom">✍️ Custom Free-Text / JSON User Data...</option>
                      </select>
                    </div>

                    {/* Job Title / Role Name (Optional) */}
                    <div className="col-md-6">
                      <label className="fs-8 fw-bold text-muted mb-1 d-block">Job Title / Role (Optional):</label>
                      <input
                        type="text"
                        className="form-control fs-7"
                        placeholder="e.g. Senior Fullstack Engineer"
                        value={manualJobTitle}
                        onChange={(e) => setManualJobTitle(e.target.value)}
                        disabled={runningATS}
                      />
                    </div>
                  </div>

                  {/* Custom User Data Textarea if custom selected */}
                  {manualProfileId === 'custom' && (
                    <div>
                      <label className="fs-8 fw-bold text-muted mb-1 d-block">Paste Candidate Resume Data (JSON or Free Text):</label>
                      <textarea
                        className="form-control font-monospace fs-7"
                        rows={4}
                        placeholder='{"personal_details": {"name": "Jane Doe"}, "skills": ["Python", "FastAPI"]}'
                        value={manualCustomUserData}
                        onChange={(e) => setManualCustomUserData(e.target.value)}
                        disabled={runningATS}
                      />
                    </div>
                  )}

                  {/* Manual Job Description Textarea */}
                  <div>
                    <label className="fs-8 fw-bold text-muted mb-1 d-block">
                      Paste Full Job Description (Free Text): <span className="text-danger">*</span>
                    </label>
                    <textarea
                      className="form-control fs-7"
                      rows={6}
                      placeholder="Paste full job posting description, key responsibilities, and required qualifications here..."
                      value={manualJobDescription}
                      onChange={(e) => setManualJobDescription(e.target.value)}
                      disabled={runningATS}
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleRunManualATSWorkflow}
                      disabled={runningATS || !manualJobDescription.trim() || (!manualProfileId && !manualCustomUserData.trim())}
                      className="btn btn-purple w-100 py-2.5 fw-bold d-flex align-items-center justify-content-center gap-2 shadow-sm"
                    >
                      {runningATS ? (
                        <>
                          <div className="spinner-border spinner-border-sm text-white" role="status"></div>
                          <span>Processing AI ATS Tailoring...</span>
                        </>
                      ) : (
                        <>
                          <i className="bi bi-cpu-fill fs-5"></i>
                          <span>Run ATS Optimization (Manual JD)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1 (Option C): Batch Jobs Workflow Configuration & Monitor */}
            {activeTab === 'batch' && (
              <div className="card-modern p-4 shadow-sm">
                <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom flex-wrap gap-2">
                  <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <i className="bi bi-layers-fill text-purple fs-4"></i>
                    <span>Batch ATS Processing Workspace</span>
                  </h5>

                  {batches.length > 0 && (
                    <div className="d-flex align-items-center gap-2">
                      <label className="fs-8 fw-bold text-muted mb-0">Select Batch Run:</label>
                      <select
                        className="form-select form-select-sm fs-8 font-monospace"
                        value={activeBatchId}
                        onChange={(e) => {
                          setActiveBatchId(e.target.value);
                          const bSessions = sessions.filter(s => s.batch_id === e.target.value);
                          if (bSessions.length > 0) setActiveSessionId(bSessions[0].session_id);
                        }}
                      >
                        {batches.map((b) => (
                          <option key={b.batch_id} value={b.batch_id}>
                            {b.batch_title} ({b.completed_jobs}/{b.total_jobs} Ready)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Launch New Batch section if selectedJobsList has items */}
                {selectedJobsList && selectedJobsList.length > 0 && (
                  <div className="p-3 bg-purple-subtle border border-purple-light rounded-3 mb-4">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <strong className="text-purple fs-7">
                        <i className="bi bi-stack me-1"></i> Launch Batch for {selectedJobsList.length} Selected Jobs
                      </strong>
                    </div>
                    <div className="row g-3 align-items-end">
                      <div className="col-md-8">
                        <label className="fs-8 fw-bold text-muted mb-1 d-block">Candidate User Profile:</label>
                        <select
                          className="form-select fs-7"
                          value={batchProfileId}
                          onChange={(e) => setBatchProfileId(e.target.value)}
                          disabled={runningBatchATS}
                        >
                          <option value="">-- Select Candidate Profile --</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.profile_name} (ID: {p.id})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-4">
                        <button
                          type="button"
                          onClick={handleStartBatchWorkflow}
                          disabled={runningBatchATS || !batchProfileId}
                          className="btn btn-purple w-100 fw-bold fs-7 d-flex align-items-center justify-content-center gap-2 py-2 shadow-sm"
                        >
                          {runningBatchATS ? (
                            <>
                              <div className="spinner-border spinner-border-sm text-white" role="status"></div>
                              <span>Starting...</span>
                            </>
                          ) : (
                            <>
                              <i className="bi bi-rocket-takeoff-fill fs-6"></i>
                              <span>Process Batch ({selectedJobsList.length} Jobs)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Batch Progress Bar & Grid if active batch selected */}
                {activeBatchId ? (
                  <div>
                    {(() => {
                      const batchSessions = sessions.filter(s => s.batch_id === activeBatchId);
                      const totalCount = batchSessions.length;
                      const completedCount = batchSessions.filter(s => s.status === 'ATS_COMPLETED' || s.status === 'PDF_GENERATING' || s.status === 'PDF_COMPLETED').length;
                      const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                      const totalBatchTokens = batchSessions.reduce((acc, s) => acc + (s.total_tokens || 0), 0);
                      const totalBatchTime = batchSessions.reduce((acc, s) => acc + (s.processing_time_seconds || 0), 0);
                      const avgTokensPerJob = completedCount > 0 ? Math.round(totalBatchTokens / completedCount) : 0;

                      return (
                        <>
                          {/* Batch Statistics & Execution Summary */}
                          <div className="mb-4 p-3 bg-light rounded-3 border">
                            <div className="row g-2 mb-3">
                              {/* Completed Jobs Stat */}
                              <div className="col-md-4">
                                <div className="p-2.5 bg-white rounded-3 border h-100 d-flex align-items-center gap-2.5 shadow-xs">
                                  <div className="p-2 bg-purple-subtle text-purple rounded-2">
                                    <i className="bi bi-check2-circle fs-5"></i>
                                  </div>
                                  <div>
                                    <small className="text-muted fs-9 d-block fw-bold text-uppercase">Completed Jobs</small>
                                    <strong className="fs-7 text-dark">{completedCount} of {totalCount} Ready</strong>
                                  </div>
                                </div>
                              </div>

                              {/* Token Utilization Stat */}
                              <div className="col-md-4">
                                <div className="p-2.5 bg-white rounded-3 border h-100 d-flex align-items-center gap-2.5 shadow-xs">
                                  <div className="p-2 bg-warning-subtle text-warning rounded-2">
                                    <i className="bi bi-cpu-fill fs-5 text-warning"></i>
                                  </div>
                                  <div>
                                    <small className="text-muted fs-9 d-block fw-bold text-uppercase">Total Token Usage</small>
                                    <strong className="fs-7 text-dark">{totalBatchTokens.toLocaleString()} tokens</strong>
                                    {completedCount > 0 && (
                                      <span className="text-muted fs-9 ms-1">({avgTokensPerJob.toLocaleString()} avg)</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Workflow Processing Time Stat */}
                              <div className="col-md-4">
                                <div className="p-2.5 bg-white rounded-3 border h-100 d-flex align-items-center gap-2.5 shadow-xs">
                                  <div className="p-2 bg-info-subtle text-info rounded-2">
                                    <i className="bi bi-stopwatch-fill fs-5 text-info"></i>
                                  </div>
                                  <div>
                                    <small className="text-muted fs-9 d-block fw-bold text-uppercase">Processing Time</small>
                                    <strong className="fs-7 text-dark">{totalBatchTime.toFixed(1)}s</strong>
                                    {completedCount > 0 && (
                                      <span className="text-muted fs-9 ms-1">({(totalBatchTime / completedCount).toFixed(1)}s avg)</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="d-flex justify-content-between align-items-center mb-1 fs-8 fw-semibold">
                              <span className="text-muted">Batch Workflow Progress</span>
                              <span className="text-purple fw-bold">{pct}%</span>
                            </div>
                            <div className="progress" style={{ height: '8px' }}>
                              <div
                                className="progress-bar bg-purple-gradient progress-bar-striped progress-bar-animated"
                                role="progressbar"
                                style={{ width: `${pct}%` }}
                              ></div>
                            </div>
                          </div>

                          <h6 className="fw-bold text-dark mb-2 fs-8">Jobs in this Batch (Click any job card to inspect its ATS data & generate PDFs):</h6>
                          <div className="row g-2 mb-3">
                            {batchSessions.map((s) => (
                              <div key={s.session_id} className="col-md-6 col-lg-4">
                                <div
                                  onClick={() => setActiveSessionId(s.session_id)}
                                  className={`p-3 rounded-3 cursor-pointer border transition-all ${
                                    activeSessionId === s.session_id
                                      ? 'bg-purple-subtle border-purple shadow-sm'
                                      : 'bg-light hover-bg-white border-secondary-subtle'
                                  }`}
                                >
                                  <div className="d-flex align-items-center justify-content-between mb-1">
                                    <span className="badge bg-white text-dark border fs-9">
                                      ID: {s.job_id}
                                    </span>
                                    {getStatusBadge(s.status)}
                                  </div>
                                  <div className="fw-bold fs-8 text-dark text-truncate mb-1">{s.title}</div>
                                  <div className="d-flex align-items-center justify-content-between gap-1 mt-2 pt-2 border-top border-light">
                                    <span className="badge bg-light text-muted border fs-9" title="Total Tokens Used">
                                      <i className="bi bi-cpu me-1 text-purple"></i>
                                      {s.total_tokens ? `${s.total_tokens.toLocaleString()} tok` : '0 tok'}
                                    </span>
                                    <span className="badge bg-light text-muted border fs-9" title="LLM Processing Time">
                                      <i className="bi bi-stopwatch me-1 text-info"></i>
                                      {s.processing_time_seconds ? `${s.processing_time_seconds}s` : '0s'}
                                    </span>
                                    {s.job_source && (
                                      <span className="badge bg-purple-subtle text-purple border border-purple-light fs-9 text-capitalize">
                                        {s.job_source}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-center text-muted py-4 fs-8">
                    No batch selected. Add jobs to your Selected Jobs Drawer and click "Process Batch".
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Generated ATS Resume Data & Interview Guide */}
            {atsData && (
              <div className="card-modern p-4 shadow-sm border-start border-4 border-purple">
                <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                      <i className="bi bi-2-circle-fill text-purple fs-4"></i>
                      <span>Step 2: ATS Optimized Resume Data</span>
                    </h5>
                    {activeSession?.total_tokens ? (
                      <span className="badge bg-purple-subtle text-purple border border-purple-light fs-9">
                        <i className="bi bi-cpu-fill me-1"></i>{activeSession.total_tokens.toLocaleString()} tokens
                      </span>
                    ) : null}
                    {activeSession?.processing_time_seconds ? (
                      <span className="badge bg-light text-dark border fs-9">
                        <i className="bi bi-stopwatch me-1 text-info"></i>{activeSession.processing_time_seconds}s
                      </span>
                    ) : null}
                  </div>
                  <button
                    onClick={() => setShowRawATSJson(!showRawATSJson)}
                    className="btn btn-sm btn-outline-purple d-flex align-items-center gap-1.5 fw-semibold"
                  >
                    <i className="bi bi-pencil-square"></i>
                    {showRawATSJson ? 'Close JSON Editor' : 'Edit / View Raw ATS JSON'}
                  </button>
                </div>

                {/* Interview Preparation Guide Highlight */}
                {interviewPoints && (
                  <div className="alert alert-warning p-3 rounded-3 shadow-sm mb-4" style={{ backgroundColor: '#fff3cd', color: '#000000', border: '1px solid #ffe69c' }}>
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className="bi bi-journal-check fs-4" style={{ color: '#856404' }}></i>
                      <strong className="fs-6" style={{ color: '#000000', fontWeight: 'bold' }}>Actionable Technical Interview Preparation Guide:</strong>
                    </div>
                    <p className="mb-0 fs-7" style={{ color: '#111111', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontWeight: 500 }}>
                      {interviewPoints}
                    </p>
                  </div>
                )}

                {/* Summary Metrics */}
                <div className="row g-3 mb-4">
                  <div className="col-md-3">
                    <div className="p-3 bg-light rounded-3 text-center">
                      <small className="text-muted fw-bold d-block mb-1">CANDIDATE</small>
                      <strong className="text-purple fs-7">{atsData.personal_details?.name || 'N/A'}</strong>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="p-3 bg-light rounded-3 text-center">
                      <small className="text-muted fw-bold d-block mb-1">WORK EXPERIENCES</small>
                      <strong className="text-dark fs-7">{atsData.experience?.length || 0} Positions</strong>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="p-3 bg-light rounded-3 text-center">
                      <small className="text-muted fw-bold d-block mb-1">PROJECTS ALIGNED</small>
                      <strong className="text-dark fs-7">{atsData.projects?.length || 0} Projects</strong>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="p-3 bg-light rounded-3 text-center">
                      <small className="text-muted fw-bold d-block mb-1">SKILL CATEGORIES</small>
                      <strong className="text-dark fs-7">{atsData.skills?.length || 0} Categories</strong>
                    </div>
                  </div>
                </div>

                {/* Raw JSON Code Editor & Save Controls */}
                {showRawATSJson && (
                  <div className="mt-3 p-3 bg-dark text-light rounded-3 shadow-sm border border-secondary">
                    <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom border-secondary">
                      <span className="fs-8 font-monospace text-purple-light fw-bold">
                        <i className="bi bi-pencil-square me-1"></i> Editable ATS Resume JSON
                      </span>
                      <div className="d-flex align-items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const p = JSON.parse(editedAtsJsonText);
                              setEditedAtsJsonText(JSON.stringify(p, null, 2));
                            } catch (e: any) {
                              alert(`Cannot format: Invalid JSON - ${e.message}`);
                            }
                          }}
                          className="btn btn-xs btn-outline-light fs-9 py-1 px-2"
                          disabled={savingAtsJson}
                        >
                          <i className="bi bi-magic me-1"></i> Format JSON
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveATSJson}
                          className="btn btn-sm btn-success fw-bold fs-8 py-1 px-3 d-flex align-items-center gap-1 shadow-sm"
                          disabled={savingAtsJson}
                        >
                          {savingAtsJson ? (
                            <>
                              <div className="spinner-border spinner-border-sm text-white" role="status"></div>
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <i className="bi bi-floppy-fill me-1"></i> Save ATS JSON
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {saveSuccessMsg && (
                      <div className="alert alert-success p-2 fs-8 fw-bold mb-2">
                        {saveSuccessMsg}
                      </div>
                    )}

                    <textarea
                      className="form-control bg-dark text-light font-monospace fs-8 border-secondary"
                      rows={16}
                      style={{ lineHeight: '1.4', whiteSpace: 'pre', resize: 'vertical' }}
                      value={editedAtsJsonText}
                      onChange={(e) => setEditedAtsJsonText(e.target.value)}
                      disabled={savingAtsJson}
                      placeholder="Paste or edit ATS resume JSON data here..."
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 3: PDF Generation Controls */}
            {atsData && (
              <div className="card-modern p-4 shadow-sm">
                <h5 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2 border-bottom pb-2">
                  <i className="bi bi-3-circle-fill text-purple fs-4"></i>
                  <span>Step 3: Render & Generate PDFs for All Templates</span>
                </h5>

                <div className="row g-3 align-items-end">
                  <div className="col-md-8">
                    <label className="fs-8 fw-bold text-muted mb-1 d-block">
                      Output Generation Filename Prefix:
                    </label>
                    <input
                      type="text"
                      className="form-control fs-7"
                      placeholder="e.g. bilal_resume_deloitte_ai"
                      value={pdfFilename}
                      onChange={(e) => setPdfFilename(e.target.value)}
                      disabled={generatingPDFs}
                    />
                  </div>
                  <div className="col-md-4">
                    <button
                      type="button"
                      onClick={handleGeneratePDFs}
                      disabled={generatingPDFs || !pdfFilename.trim()}
                      className="btn btn-success w-100 fw-bold fs-7 d-flex align-items-center justify-content-center gap-2"
                      style={{ height: '38px' }}
                    >
                      {generatingPDFs ? (
                        <>
                          <div className="spinner-border spinner-border-sm text-white" role="status"></div>
                          <span>Generating PDFs...</span>
                        </>
                      ) : (
                        <>
                          <i className="bi bi-file-earmark-pdf-fill fs-5"></i>
                          <span>Generate PDFs</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Live PDF Templates Viewer Tabs */}
            {activeSession.pdf_links && activeSession.pdf_links.length > 0 && (
              <div className="card-modern p-4 shadow-sm border-start border-4 border-success">
                <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom flex-wrap gap-2">
                  <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <i className="bi bi-4-circle-fill text-success fs-4"></i>
                    <span>Step 4: Preview Generated Resume PDFs</span>
                  </h5>

                  <div className="d-flex align-items-center gap-2">
                    {activeSession.job_id && (
                      <a
                        href={
                          activeSession.job_url
                            ? activeSession.job_url
                            : activeSession.job_id.startsWith('http')
                              ? activeSession.job_id
                              : activeSession.job_source === 'naukri'
                                ? `https://www.naukri.com/job-listings-${activeSession.job_id}`
                                : `https://www.linkedin.com/jobs/view/${activeSession.job_id}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`btn btn-sm ${activeSession.job_source === 'naukri' ? 'btn-outline-info' : 'btn-outline-primary'} d-flex align-items-center gap-1.5 font-semibold`}
                      >
                        {activeSession.job_source === 'naukri' ? (
                          <>
                            <span className="fw-bold text-info" style={{ fontSize: '12px' }}>Naukri</span>
                            <span>View on Naukri</span>
                          </>
                        ) : (
                          <>
                            <i className="bi bi-linkedin text-primary"></i>
                            <span>View on LinkedIn</span>
                          </>
                        )}
                      </a>
                    )}

                    {activeSession.job_id && (
                      <button
                        type="button"
                        onClick={() => onOpenJobModal(activeSession.job_id!, activeSession.job_source, activeSession.job_url)}
                        className="btn btn-sm btn-outline-purple d-flex align-items-center gap-1.5 font-semibold"
                      >
                        <i className="bi bi-eye-fill"></i>
                        <span>Inspect Job</span>
                      </button>
                    )}

                    {activeSession.pdf_links[selectedPdfIndex] && (
                      <a
                        href={activeSession.pdf_links[selectedPdfIndex].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-purple d-flex align-items-center gap-1 font-semibold"
                      >
                        <i className="bi bi-box-arrow-up-right"></i>
                        <span>Open in Full Tab</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Sub-Tabs for Template PDFs */}
                <ul className="nav nav-tabs border-bottom-0 gap-2 mb-3">
                  {activeSession.pdf_links.map((link, idx) => {
                    const isSelected = selectedPdfIndex === idx;
                    const cleanName = link.template_name.replace(/_/g, ' ');
                    return (
                      <li key={idx} className="nav-item">
                        <button
                          type="button"
                          onClick={() => setSelectedPdfIndex(idx)}
                          className={`nav-link fs-7 fw-semibold rounded-3 py-2 px-3 border-0 transition ${
                            isSelected
                              ? 'bg-purple text-white shadow-sm'
                              : 'bg-light text-secondary hover-bg-purple-light'
                          }`}
                        >
                          <i className="bi bi-file-pdf-fill me-1.5 text-danger"></i>
                          <span className="text-capitalize">{cleanName}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {/* PDF Inline iFrame Viewer */}
                {activeSession.pdf_links[selectedPdfIndex] && (
                  <div className="border rounded-3 overflow-hidden bg-dark shadow-sm">
                    <div className="bg-dark text-white p-2 px-3 d-flex justify-content-between align-items-center border-bottom border-secondary fs-8">
                      <span className="text-capitalize font-monospace">
                        <i className="bi bi-eye-fill me-1 text-purple"></i>
                        Previewing: {activeSession.pdf_links[selectedPdfIndex].template_name.replace(/_/g, ' ')} Template
                      </span>
                      <div className="d-flex align-items-center gap-3">
                        {activeSession.job_id && (
                          <a
                            href={
                              activeSession.job_url
                                ? activeSession.job_url
                                : activeSession.job_id.startsWith('http')
                                  ? activeSession.job_id
                                  : activeSession.job_source === 'naukri'
                                    ? `https://www.naukri.com/job-listings-${activeSession.job_id}`
                                    : `https://www.linkedin.com/jobs/view/${activeSession.job_id}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-info text-decoration-none font-monospace fs-9 d-flex align-items-center gap-1 hover-underline"
                          >
                            {activeSession.job_source === 'naukri' ? (
                              <span className="fw-bold me-1 text-info">Naukri</span>
                            ) : (
                              <i className="bi bi-linkedin text-primary"></i>
                            )}
                            <span>Job #{activeSession.job_id}</span>
                          </a>
                        )}
                        <small className="text-muted font-monospace">{activeSession.pdf_links[selectedPdfIndex].filename}</small>
                      </div>
                    </div>

                    <iframe
                      src={activeSession.pdf_links[selectedPdfIndex].url}
                      title={activeSession.pdf_links[selectedPdfIndex].template_name}
                      style={{ width: '100%', height: '700px', border: 'none' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="d-flex align-items-center justify-content-center h-100 text-muted">
            Select or create a workflow session to start the ATS Resume Optimization process.
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowPage;
