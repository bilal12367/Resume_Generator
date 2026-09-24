import React from 'react';

export interface QueuedAtsJob {
  job_id: string;
  company_name?: string;
  job_title?: string;
  step: 'pending' | 'fetching_jd' | 'llm_generating' | 'compiling_pdf' | 'completed' | 'error';
  message: string;
  result?: any;
}

interface AtsQueueTrackerProps {
  isGenerating: boolean;
  totalJobs: number;
  currentJobIndex: number;
  queueList: QueuedAtsJob[];
  statusMessage: string;
  onClose?: () => void;
  onOpenJobModal?: (jid: string) => void;
}

export const AtsQueueTracker: React.FC<AtsQueueTrackerProps> = ({
  isGenerating,
  totalJobs,
  currentJobIndex,
  queueList,
  statusMessage,
  onClose,
  onOpenJobModal,
}) => {
  if (!isGenerating && queueList.length === 0) return null;

  const completedCount = queueList.filter((j) => j.step === 'completed').length;
  const progressPercent = totalJobs > 0 ? Math.round((completedCount / totalJobs) * 100) : 0;
  const activeDisplayIndex = currentJobIndex > 0 ? currentJobIndex : (completedCount > 0 ? completedCount : 1);

  const activeJob = queueList[activeDisplayIndex - 1] || queueList.find((q) => q.step === 'llm_generating' || q.step === 'compiling_pdf' || q.step === 'fetching_jd');
  const activeCompanyTag = activeJob?.company_name ? ` — 🏢 ${activeJob.company_name}` : '';
  const isAllCompleted = !isGenerating && (completedCount === totalJobs || completedCount > 0);

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: isAllCompleted ? '1px solid #10b981' : '1px solid rgba(139, 92, 246, 0.4)',
        borderRadius: '12px',
        padding: '1.2rem',
        marginBottom: '1rem',
        boxShadow: isAllCompleted ? '0 8px 32px rgba(16, 185, 129, 0.25)' : '0 8px 32px rgba(139, 92, 246, 0.25)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
      }}
    >
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {isGenerating ? (
            <div className="spinner-ring" style={{ width: '22px', height: '22px', borderTopColor: '#c084fc' }} />
          ) : (
            <span style={{ fontSize: '1.2rem' }}>🎉</span>
          )}
          <h4 style={{ margin: 0, fontSize: '0.98rem', color: '#f3f4f6', fontWeight: 700 }}>
            {isGenerating ? `⚡ Active ATS Generation Queue (Job ${activeDisplayIndex} of ${totalJobs}${activeCompanyTag})` : `🎉 ATS Generation Completed (${completedCount} of ${totalJobs} Jobs Ready)`}
          </h4>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}
            title="Dismiss Queue Widget"
          >
            ✖
          </button>
        )}
      </div>

      {/* Progress Bar Container */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#cbd5e1' }}>
          <span>{isAllCompleted ? '✅ All requested ATS Resumes & 4 PDFs generated successfully!' : statusMessage || 'Processing queue...'}</span>
          <span style={{ fontWeight: 700, color: isAllCompleted ? '#34d399' : '#a78bfa' }}>{progressPercent}% Complete</span>
        </div>
        <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: isAllCompleted ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)' : 'linear-gradient(90deg, #8b5cf6 0%, #10b981 100%)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Queue Items List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '180px', overflowY: 'auto' }}>
        {queueList.map((item, idx) => {
          const isDone = item.step === 'completed';
          const isErr = item.step === 'error';

          return (
            <div
              key={item.job_id || idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.55rem 0.85rem',
                borderRadius: '6px',
                background: isDone
                  ? 'rgba(16, 185, 129, 0.12)'
                  : isErr
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(255, 255, 255, 0.04)',
                border: isDone
                  ? '1px solid rgba(16, 185, 129, 0.3)'
                  : isErr
                  ? '1px solid rgba(239, 68, 68, 0.3)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '0.8rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    background: 'rgba(139, 92, 246, 0.2)',
                    color: '#c084fc',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                >
                  #{item.job_id}
                </span>
                {item.company_name && (
                  <span
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '4px',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                    }}
                  >
                    🏢 {item.company_name}
                  </span>
                )}
                <span style={{ color: isDone ? '#34d399' : isErr ? '#f87171' : '#e2e8f0', fontWeight: 500 }}>
                  {item.message || (isDone ? 'ATS Resume & PDFs Generated' : 'Queued for processing...')}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                {item.step === 'pending' && <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>⏳ Queued</span>}
                {item.step === 'fetching_jd' && <span style={{ color: '#60a5fa', fontSize: '0.72rem' }}>🔍 Fetching JD...</span>}
                {item.step === 'llm_generating' && <span style={{ color: '#c084fc', fontSize: '0.72rem' }}>🧠 LLM Tailoring...</span>}
                {item.step === 'compiling_pdf' && <span style={{ color: '#f59e0b', fontSize: '0.72rem' }}>📄 Compiling PDFs...</span>}
                {item.step === 'completed' && (
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <span style={{ background: '#10b981', color: '#fff', fontSize: '0.68rem', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                      ✅ Ready
                    </span>
                    {onOpenJobModal && (
                      <button
                        onClick={() => onOpenJobModal(item.job_id)}
                        style={{
                          background: 'rgba(139, 92, 246, 0.25)',
                          border: '1px solid rgba(139, 92, 246, 0.5)',
                          color: '#ddd6fe',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        📖 View PDFs
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isAllCompleted && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', padding: '0.6rem 0.9rem', borderRadius: '8px', marginTop: '0.2rem' }}>
          <span style={{ fontSize: '0.82rem', color: '#6ee7b7', fontWeight: 600 }}>
            🎉 All {completedCount} ATS Resumes & PDFs are compiled and saved in the Processed section!
          </span>
          {onClose && (
            <button
              onClick={onClose}
              style={{ background: '#10b981', border: 'none', color: '#ffffff', padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Done & Dismiss ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
};
