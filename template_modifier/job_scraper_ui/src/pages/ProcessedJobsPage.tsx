import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AtsQueueTracker, type QueuedAtsJob } from '../components/AtsQueueTracker';
import { centrifugoService } from '../services/centrifugoClient';

const API_BASE = 'http://127.0.0.1:8080';

export const ProcessedJobsPage: React.FC = () => {
  const [processedJobs, setProcessedJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pdf_ready' | 'ats_json' | 'jd_cached'>('all');
  const [locationFilter, setLocationFilter] = useState<'all' | 'remote' | 'onsite'>('all');
  const [sortBy, setSortBy] = useState<'id_desc' | 'id_asc' | 'title_asc' | 'company_asc'>('id_desc');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'jd' | 'json' | 'pdf'>('jd');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ATS Real-time Generation Queue State
  const [atsQueue, setAtsQueue] = useState<QueuedAtsJob[]>([]);
  const [atsQueueStatusMsg, setAtsQueueStatusMsg] = useState<string>('');
  const [atsQueueTotal, setAtsQueueTotal] = useState<number>(0);
  const [atsQueueCurrentIndex, setAtsQueueCurrentIndex] = useState<number>(0);

  useEffect(() => {
    fetchProcessedJobs();

    const handleCentrifugoEvent = (evt: any) => {
      const anyEvt = evt.data || evt;

      if (anyEvt.event_type === 'ats_generation_started') {
        setIsGenerating(true);
        const jids: string[] = anyEvt.job_ids || [];
        setAtsQueueTotal(jids.length);
        setAtsQueueCurrentIndex(0);
        setAtsQueueStatusMsg(`Started ATS generation queue for ${jids.length} job(s)...`);
        setAtsQueue(
          jids.map((jid) => ({
            job_id: jid,
            step: 'pending',
            message: 'Queued for processing...',
          }))
        );
      }

      if (anyEvt.event_type === 'ats_generation_progress') {
        setIsGenerating(true);
        const jid = anyEvt.job_id;
        const step = anyEvt.step || 'llm_generating';
        const msg = anyEvt.message || `Processing Job #${jid}...`;
        if (anyEvt.current) setAtsQueueCurrentIndex(anyEvt.current);
        if (anyEvt.total) setAtsQueueTotal(anyEvt.total);
        setAtsQueueStatusMsg(msg);

        setAtsQueue((prev) => {
          const idx = prev.findIndex((q) => q.job_id === jid);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], step: step as any, message: msg };
            return updated;
          } else {
            return [...prev, { job_id: jid, step: step as any, message: msg }];
          }
        });
      }

      if (anyEvt.event_type === 'ats_job_completed') {
        const jid = anyEvt.job_id;
        const msg = anyEvt.message || `✅ ATS Resume & 4 PDFs generated for Job #${jid}!`;
        showToast(msg);

        setAtsQueue((prev) => {
          const idx = prev.findIndex((q) => q.job_id === jid);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              step: 'completed',
              message: '✅ Ready in Processed Section',
              result: anyEvt.result,
            };
            return updated;
          }
          return prev;
        });

        // Automatically update processed section list immediately!
        fetchProcessedJobs();
      }

      if (anyEvt.event_type === 'ats_generation_completed') {
        setIsGenerating(false);
        setAtsQueueStatusMsg('🎉 ATS Generation completed for all queued jobs!');
        showToast(`🎉 ATS Generation finished for all jobs!`);
        fetchProcessedJobs();
      }
    };

    centrifugoService.on('all', handleCentrifugoEvent);
    return () => {
      centrifugoService.off('all', handleCentrifugoEvent);
    };
  }, []);

  const fetchProcessedJobs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/processed-jobs/all`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && Array.isArray(data.jobs)) {
          setProcessedJobs(data.jobs);
          if (data.jobs.length > 0 && !activeJobId) {
            setActiveJobId(data.jobs[0].job_id);
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch processed jobs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  };

  const toggleSelectJob = (jid: string) => {
    setSelectedJobIds((prev) =>
      prev.includes(jid) ? prev.filter((id) => id !== jid) : [...prev, jid]
    );
  };

  const handleSelectAll = () => {
    if (selectedJobIds.length === filteredJobs.length) {
      setSelectedJobIds([]);
    } else {
      setSelectedJobIds(filteredJobs.map((j) => j.job_id));
    }
  };

  const handleBatchGenerateATS = async (jobIdsToProcess?: string[]) => {
    const ids = jobIdsToProcess || selectedJobIds;
    if (ids.length === 0 || isGenerating) return;
    setIsGenerating(true);
    setAtsQueueTotal(ids.length);
    setAtsQueueCurrentIndex(1);
    setAtsQueueStatusMsg(`Initiating workflow for ${ids.length} job(s)...`);
    setAtsQueue(
      ids.map((id) => ({
        job_id: id,
        step: 'pending',
        message: 'Queued for processing...',
      }))
    );

    showToast(`⚡ Starting ATS Resume & PDF generation for ${ids.length} job(s)...`);
    try {
      const res = await fetch(`${API_BASE}/generate-ats-resumes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'browser_batch',
          job_ids: ids,
        }),
      });
      if (res.ok) {
        showToast(`🎉 Submitted ${ids.length} job(s) to ATS workflow!`);
      } else {
        showToast('⚠️ Error generating ATS resumes.');
      }
    } catch (e: any) {
      showToast(`⚠️ Error: ${e.message}`);
    }
  };

  // Counting metrics for quick filter chips
  const totalCount = processedJobs.length;
  const pdfCount = processedJobs.filter((j) => j.has_pdf).length;
  const atsCount = processedJobs.filter((j) => j.has_ats_json).length;
  const jdCount = processedJobs.filter((j) => j.job_details?.raw_description).length;

  // Filtering logic
  const filteredJobs = processedJobs
    .filter((item) => {
      // 1. Text Search Filter
      const query = searchTerm.toLowerCase().trim();
      if (query) {
        const jid = String(item.job_id).toLowerCase();
        const title = String(item.job_details?.title || item.job_details?.job_title || '').toLowerCase();
        const company = String(item.job_details?.company_name || '').toLowerCase();
        const loc = String(item.job_details?.location || '').toLowerCase();
        const matchesQuery = jid.includes(query) || title.includes(query) || company.includes(query) || loc.includes(query);
        if (!matchesQuery) return false;
      }

      // 2. Status Filter
      if (statusFilter === 'pdf_ready' && !item.has_pdf) return false;
      if (statusFilter === 'ats_json' && !item.has_ats_json) return false;
      if (statusFilter === 'jd_cached' && !item.job_details?.raw_description) return false;

      // 3. Location Filter
      const locationText = String(item.job_details?.location || '').toLowerCase();
      if (locationFilter === 'remote' && !locationText.includes('remote')) return false;
      if (locationFilter === 'onsite' && locationText.includes('remote')) return false;

      return true;
    })
    .sort((a, b) => {
      // Sorting logic
      if (sortBy === 'id_desc') return String(b.job_id).localeCompare(String(a.job_id), undefined, { numeric: true });
      if (sortBy === 'id_asc') return String(a.job_id).localeCompare(String(b.job_id), undefined, { numeric: true });
      if (sortBy === 'title_asc') {
        const titleA = String(a.job_details?.title || a.job_details?.job_title || a.job_id).toLowerCase();
        const titleB = String(b.job_details?.title || b.job_details?.job_title || b.job_id).toLowerCase();
        return titleA.localeCompare(titleB);
      }
      if (sortBy === 'company_asc') {
        const compA = String(a.job_details?.company_name || '').toLowerCase();
        const compB = String(b.job_details?.company_name || '').toLowerCase();
        return compA.localeCompare(compB);
      }
      return 0;
    });

  const activeJobItem = processedJobs.find((j) => j.job_id === activeJobId);
  const activeJd = activeJobItem?.job_details || {};
  const activeAts = activeJobItem?.ats_resume || {};

  const pdfTemplates = activeJobId
    ? [
        { name: 'Colored Accent (Recommended)', file: `resume_${activeJobId}_colored_accent_template.pdf` },
        { name: 'Classic Resume', file: `resume_${activeJobId}_resume_template.pdf` },
        { name: 'Modern Minimal', file: `resume_${activeJobId}_modern_minimal_template.pdf` },
        { name: 'Professional Thin', file: `resume_${activeJobId}_professional_thin_template.pdf` },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0b0f19', color: '#f3f4f6' }}>
      {/* Top Navigation Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.8rem 1.8rem',
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⚡</span> Resume AI & ATS Job Browser
          </div>
          <span style={{ fontSize: '0.75rem', background: 'rgba(139, 92, 246, 0.2)', color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.4)', padding: '0.25rem 0.6rem', borderRadius: '12px', fontWeight: 600 }}>
            v2.0 Production
          </span>
        </div>

        {/* Page Switcher Navigation */}
        <nav style={{ display: 'flex', gap: '0.6rem' }}>
          <Link
            to="/"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#94a3b8',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            💬 Agent Chat
          </Link>
          <Link
            to="/processed-jobs"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              color: '#ffffff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 10px rgba(139, 92, 246, 0.3)',
            }}
          >
            📁 Processed Jobs & ATS Gallery
          </Link>
        </nav>
      </header>

      {/* Main Workspace Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Column: Processed Jobs Master List & Filter Sidebar */}
        <div
          style={{
            width: '420px',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* List Header, Quick Filters & Search Control */}
          <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#f1f5f9', fontWeight: 700 }}>
                📁 Processed Job Postings ({filteredJobs.length})
              </h3>
              <button
                onClick={fetchProcessedJobs}
                style={{ background: 'transparent', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
              >
                🔄 Refresh
              </button>
            </div>

            {/* Search Bar */}
            <input
              type="text"
              placeholder="🔍 Search Job Title, Company, Location, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                padding: '0.55rem 0.8rem',
                color: '#f8fafc',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />

            {/* Quick Filter Chips Row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              <button
                onClick={() => setStatusFilter('all')}
                style={{
                  background: statusFilter === 'all' ? '#8b5cf6' : 'rgba(255, 255, 255, 0.05)',
                  color: statusFilter === 'all' ? '#fff' : '#94a3b8',
                  border: statusFilter === 'all' ? '1px solid #a78bfa' : '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All ({totalCount})
              </button>
              <button
                onClick={() => setStatusFilter('pdf_ready')}
                style={{
                  background: statusFilter === 'pdf_ready' ? '#10b981' : 'rgba(16, 185, 129, 0.1)',
                  color: statusFilter === 'pdf_ready' ? '#fff' : '#34d399',
                  border: statusFilter === 'pdf_ready' ? '1px solid #34d399' : '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                📄 PDFs Ready ({pdfCount})
              </button>
              <button
                onClick={() => setStatusFilter('ats_json')}
                style={{
                  background: statusFilter === 'ats_json' ? '#8b5cf6' : 'rgba(139, 92, 246, 0.1)',
                  color: statusFilter === 'ats_json' ? '#fff' : '#c084fc',
                  border: statusFilter === 'ats_json' ? '1px solid #a78bfa' : '1px solid rgba(139, 92, 246, 0.3)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ⚡ ATS JSON ({atsCount})
              </button>
              <button
                onClick={() => setStatusFilter('jd_cached')}
                style={{
                  background: statusFilter === 'jd_cached' ? '#3b82f6' : 'rgba(59, 130, 246, 0.1)',
                  color: statusFilter === 'jd_cached' ? '#fff' : '#60a5fa',
                  border: statusFilter === 'jd_cached' ? '1px solid #60a5fa' : '1px solid rgba(59, 130, 246, 0.3)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                📖 JD Cached ({jdCount})
              </button>
            </div>

            {/* Dropdown Filters & Sorting Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.1rem' }}>
              {/* Location Filter Dropdown */}
              <select
                value={locationFilter}
                onChange={(e: any) => setLocationFilter(e.target.value)}
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.5rem',
                  color: '#cbd5e1',
                  fontSize: '0.75rem',
                  outline: 'none',
                }}
              >
                <option value="all" style={{ background: '#0f172a' }}>📍 All Locations</option>
                <option value="remote" style={{ background: '#0f172a' }}>🏠 Remote Only</option>
                <option value="onsite" style={{ background: '#0f172a' }}>🏢 Onsite / Hybrid</option>
              </select>

              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.5rem',
                  color: '#cbd5e1',
                  fontSize: '0.75rem',
                  outline: 'none',
                }}
              >
                <option value="id_desc" style={{ background: '#0f172a' }}>🔢 Sort: ID (Newest)</option>
                <option value="id_asc" style={{ background: '#0f172a' }}>🔢 Sort: ID (Oldest)</option>
                <option value="title_asc" style={{ background: '#0f172a' }}>🔤 Sort: Job Title (A-Z)</option>
                <option value="company_asc" style={{ background: '#0f172a' }}>🏢 Sort: Company (A-Z)</option>
              </select>
            </div>

            {/* Batch Selection Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.2rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <button
                onClick={handleSelectAll}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                {selectedJobIds.length === filteredJobs.length ? 'Deselect All' : 'Select All'}
              </button>
              {selectedJobIds.length > 0 && (
                <button
                  disabled={isGenerating}
                  onClick={() => handleBatchGenerateATS()}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Process Selected ({selectedJobIds.length})
                </button>
              )}
            </div>
          </div>

          {/* Job List Cards View */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                <div className="spinner-ring" style={{ width: '32px', height: '32px', marginBottom: '0.5rem' }} />
                <div>Loading Processed Jobs...</div>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', fontSize: '0.85rem' }}>
                No processed jobs matching current filter settings.
              </div>
            ) : (
              filteredJobs.map((item) => {
                const jid = item.job_id;
                const isSelected = selectedJobIds.includes(jid);
                const isActive = activeJobId === jid;
                const jd = item.job_details || {};
                const jobTitle = jd.title || jd.job_title || `Job Position #${jid}`;

                return (
                  <div
                    key={jid}
                    onClick={() => setActiveJobId(jid)}
                    style={{
                      padding: '0.85rem 0.95rem',
                      borderRadius: '8px',
                      background: isActive ? 'rgba(139, 92, 246, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                      border: isActive ? '1px solid #a78bfa' : '1px solid rgba(255, 255, 255, 0.06)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem',
                      boxShadow: isActive ? '0 4px 12px rgba(139, 92, 246, 0.2)' : 'none',
                    }}
                  >
                    {/* Header: Checkbox + Prominent Job Title */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectJob(jid)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: '#8b5cf6', cursor: 'pointer', marginTop: '0.2rem' }}
                        />
                        <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.92rem', lineHeight: '1.3' }}>
                          {jobTitle}
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                        {item.has_pdf && (
                          <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                            PDF Ready
                          </span>
                        )}
                        {item.has_ats_json && (
                          <span style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#c084fc', fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                            ATS JSON
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sub-Header: Job ID Badge & Company Info */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.1rem' }}>
                      <span
                        style={{
                          background: 'rgba(139, 92, 246, 0.2)',
                          color: '#c084fc',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          fontFamily: 'monospace',
                        }}
                      >
                        #{jid}
                      </span>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        🏢 {jd.company_name || 'Tech MNC'} • 📍 {jd.location || 'India'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Processed Job Details Viewer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0b0f19', overflow: 'hidden' }}>
          {/* Real-Time ATS Generation Queue Tracker Banner */}
          <div style={{ padding: '1rem 1.5rem 0 1.5rem' }}>
            <AtsQueueTracker
              isGenerating={isGenerating}
              totalJobs={atsQueueTotal}
              currentJobIndex={atsQueueCurrentIndex}
              queueList={atsQueue}
              statusMessage={atsQueueStatusMsg}
              onClose={() => setAtsQueue([])}
            />
          </div>

          {activeJobItem ? (
            <>
              {/* Job Details Header */}
              <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(15, 23, 42, 0.4)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#ffffff', fontWeight: 700 }}>
                      {activeJd.title || activeJd.job_title || `Job Position #${activeJobId}`}
                    </h2>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                      <span>🏢 {activeJd.company_name || 'Top MNC Company'}</span>
                      <span>📍 {activeJd.location || 'India / Remote'}</span>
                      <span>
                        Job ID: <code style={{ color: '#c084fc', fontWeight: 700 }}>#{activeJobId}</code>
                      </span>
                    </div>
                  </div>

                  {/* Regenerate Action Button */}
                  <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button
                      disabled={isGenerating}
                      onClick={() => {
                        if (activeJobId) {
                          handleBatchGenerateATS([activeJobId]);
                        }
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '6px',
                        padding: '0.5rem 1rem',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      ⚡ Regenerate ATS & PDFs
                    </button>
                  </div>
                </div>

                {/* Detail View Tab Selector */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setActiveDetailTab('jd')}
                    style={{
                      padding: '0.45rem 0.9rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: activeDetailTab === 'jd' ? '#8b5cf6' : 'rgba(255, 255, 255, 0.05)',
                      color: activeDetailTab === 'jd' ? '#fff' : '#94a3b8',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    📋 Job Description
                  </button>
                  <button
                    onClick={() => setActiveDetailTab('json')}
                    style={{
                      padding: '0.45rem 0.9rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: activeDetailTab === 'json' ? '#8b5cf6' : 'rgba(255, 255, 255, 0.05)',
                      color: activeDetailTab === 'json' ? '#fff' : '#94a3b8',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    📄 ATS Resume JSON
                  </button>
                  <button
                    onClick={() => setActiveDetailTab('pdf')}
                    style={{
                      padding: '0.45rem 0.9rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: activeDetailTab === 'pdf' ? '#8b5cf6' : 'rgba(255, 255, 255, 0.05)',
                      color: activeDetailTab === 'pdf' ? '#fff' : '#94a3b8',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    📂 Rendered PDF Resumes {activeJobItem.has_pdf && '✅'}
                  </button>
                </div>
              </div>

              {/* Tab Contents Area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* TAB 1: Job Description */}
                {activeDetailTab === 'jd' && (
                  <>
                    {activeJd.skills_required && activeJd.skills_required.length > 0 && (
                      <div>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                          🛠️ Required Skills
                        </h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {activeJd.skills_required.map((sk: string, idx: number) => (
                            <span key={idx} style={{ background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#ddd6fe', padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                              {sk}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                        📝 Raw Job Description
                      </h4>
                      <div style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '1.2rem', fontSize: '0.88rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: '#cbd5e1' }}>
                        {activeJd.raw_description || activeJd.minimal_description || `No raw description stored for Job ID ${activeJobId}.`}
                      </div>
                    </div>
                  </>
                )}

                {/* TAB 2: ATS Resume JSON */}
                {activeDetailTab === 'json' && (
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#c084fc', textTransform: 'uppercase' }}>
                      📄 Formatted ATS Candidate Profile JSON
                    </h4>
                    <pre style={{ background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '1.2rem', fontSize: '0.8rem', color: '#a7f3d0', overflowX: 'auto', fontFamily: 'monospace', maxHeight: '500px' }}>
                      {activeAts.generated_json
                        ? JSON.stringify(activeAts.generated_json, null, 2)
                        : activeAts.generated_data
                        ? JSON.stringify(activeAts.generated_data, null, 2)
                        : 'No ATS candidate JSON generated yet for this job.'}
                    </pre>
                  </div>
                )}

                {/* TAB 3: Rendered PDF Resumes with Instant Downloads & Apply Link */}
                {activeDetailTab === 'pdf' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '8px', padding: '1rem', color: '#34d399', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>🎉 4 PDF Resume Templates Rendered & Downloadable for Job #{activeJobId}</span>
                      <a
                        href={activeJd.job_url || `https://www.linkedin.com/jobs/view/${activeJobId}/`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: 'linear-gradient(135deg, #0077b5 0%, #00a0dc 100%)',
                          color: '#ffffff',
                          padding: '0.4rem 0.9rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          boxShadow: '0 2px 8px rgba(0, 119, 181, 0.4)',
                        }}
                      >
                        🚀 Apply on LinkedIn ↗
                      </a>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      {pdfTemplates.map((tpl, tIdx) => {
                        const relativePath = `output/resume_${activeJobId}/${tpl.file}`;
                        const downloadUrl = `${API_BASE}/download-pdf?file_path=${encodeURIComponent(relativePath)}`;
                        const previewUrl = `${API_BASE}/${relativePath}`;

                        return (
                          <div key={tIdx} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.9rem' }}>
                              📄 {tpl.name}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                              {tpl.file}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                              <a
                                href={downloadUrl}
                                download
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  flex: 1,
                                  textAlign: 'center',
                                  background: '#10b981',
                                  color: '#fff',
                                  padding: '0.45rem 0.6rem',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                }}
                              >
                                📥 Download PDF
                              </a>
                              <a
                                href={previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  flex: 1,
                                  textAlign: 'center',
                                  background: 'rgba(255, 255, 255, 0.1)',
                                  color: '#93c5fd',
                                  padding: '0.45rem 0.6rem',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                }}
                              >
                                👁️ Preview ↗
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              Select a processed job posting from the left sidebar to view details.
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification Popup */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: '#1e293b', border: '1px solid #8b5cf6', color: '#f8fafc', padding: '0.8rem 1.2rem', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', zIndex: 9999, fontSize: '0.85rem' }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
};
