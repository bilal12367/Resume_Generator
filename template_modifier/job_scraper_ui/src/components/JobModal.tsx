import React from 'react';

interface JobModalProps {
  activeModalJobId: string | null;
  onClose: () => void;
  jobDescriptionsMap: Record<string, any>;
  generatedAtsResults: any[];
  modalActiveTab: 'summary' | 'json' | 'pdf';
  setModalActiveTab: (tab: 'summary' | 'json' | 'pdf') => void;
  modalSessionIdInput: string;
  setModalSessionIdInput: (id: string) => void;
  isRegeneratingPdf: boolean;
  onRegeneratePdf: () => void;
  isGeneratingResumes: boolean;
  onGenerateATSResumes: (jobIds: string[]) => Promise<void>;
}

export const JobModal: React.FC<JobModalProps> = ({
  activeModalJobId,
  onClose,
  jobDescriptionsMap,
  generatedAtsResults,
  modalActiveTab,
  setModalActiveTab,
  modalSessionIdInput,
  setModalSessionIdInput,
  isRegeneratingPdf,
  onRegeneratePdf,
  isGeneratingResumes,
  onGenerateATSResumes,
}) => {
  if (!activeModalJobId) return null;

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
      onClick={onClose}
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
            background:
              'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)',
          }}
        >
          <div>
            <span
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#c084fc',
                fontWeight: 600,
              }}
            >
              Job ID: {activeModalJobId}
            </span>
            <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.15rem', color: '#ffffff' }}>
              {jobDescriptionsMap[activeModalJobId]?.title || `Job Description #${activeModalJobId}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#94a3b8',
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

        {/* Modal 3-Step Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <button
            onClick={() => setModalActiveTab('summary')}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: 'none',
              background:
                modalActiveTab === 'summary' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
              borderBottom:
                modalActiveTab === 'summary' ? '2px solid #8b5cf6' : '2px solid transparent',
              color: modalActiveTab === 'summary' ? '#ffffff' : '#94a3b8',
              fontWeight: modalActiveTab === 'summary' ? 700 : 500,
              fontSize: '0.83rem',
              cursor: 'pointer',
            }}
          >
            Step 1: 💡 Summary & JD
          </button>
          <button
            onClick={() => setModalActiveTab('json')}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: 'none',
              background: modalActiveTab === 'json' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
              borderBottom:
                modalActiveTab === 'json' ? '2px solid #8b5cf6' : '2px solid transparent',
              color: modalActiveTab === 'json' ? '#ffffff' : hasJson ? '#94a3b8' : '#64748b',
              fontWeight: modalActiveTab === 'json' ? 700 : 500,
              fontSize: '0.83rem',
              cursor: 'pointer',
            }}
          >
            Step 2: 📄 Generated ATS JSON {hasJson ? '✅' : '🔒'}
          </button>
          <button
            onClick={() => setModalActiveTab('pdf')}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: 'none',
              background: modalActiveTab === 'pdf' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
              borderBottom:
                modalActiveTab === 'pdf' ? '2px solid #8b5cf6' : '2px solid transparent',
              color: modalActiveTab === 'pdf' ? '#ffffff' : hasPdf ? '#94a3b8' : '#64748b',
              fontWeight: modalActiveTab === 'pdf' ? 700 : 500,
              fontSize: '0.83rem',
              cursor: 'pointer',
            }}
          >
            Step 3: 📂 PDF Output {hasPdf ? '✅' : '🔒'}
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.2rem',
          }}
        >
          {/* STEP 1: Summary & Raw JD View */}
          {modalActiveTab === 'summary' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    padding: '0.8rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Company:</span>
                  <div style={{ fontWeight: 600, color: '#f1f5f9' }}>
                    🏢 {jobDescriptionsMap[activeModalJobId]?.company_name || 'Top MNC'}
                  </div>
                </div>
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    padding: '0.8rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Location:</span>
                  <div style={{ fontWeight: 600, color: '#f1f5f9' }}>
                    📍 {jobDescriptionsMap[activeModalJobId]?.location || 'India / Remote'}
                  </div>
                </div>
              </div>

              {jobDescriptionsMap[activeModalJobId]?.skills_required?.length > 0 && (
                <div>
                  <h4
                    style={{
                      margin: '0 0 0.5rem 0',
                      fontSize: '0.85rem',
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    🛠️ Required Skills
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {jobDescriptionsMap[activeModalJobId].skills_required.map(
                      (skill: string, sIdx: number) => (
                        <span
                          key={sIdx}
                          style={{
                            background: 'rgba(139, 92, 246, 0.15)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            color: '#ddd6fe',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                          }}
                        >
                          {skill}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}

              {jobDescriptionsMap[activeModalJobId]?.minimal_description && (
                <div>
                  <h4
                    style={{
                      margin: '0 0 0.5rem 0',
                      fontSize: '0.85rem',
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    💡 Minimal Summary
                  </h4>
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '1rem',
                      fontSize: '0.88rem',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      color: '#e2e8f0',
                    }}
                  >
                    {jobDescriptionsMap[activeModalJobId].minimal_description}
                  </div>
                </div>
              )}

              <div>
                <h4
                  style={{
                    margin: '0 0 0.5rem 0',
                    fontSize: '0.85rem',
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  📝 Full Job Description
                </h4>
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '1rem',
                    fontSize: '0.85rem',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    color: '#cbd5e1',
                    maxHeight: '240px',
                    overflowY: 'auto',
                  }}
                >
                  {jobDescriptionsMap[activeModalJobId]?.raw_description ||
                    'No raw job description cached yet.'}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '0.5rem',
                  paddingTop: '0.8rem',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                }}
              >
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
                      await onGenerateATSResumes([activeModalJobId]);
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
              <h4
                style={{
                  margin: '0 0 0.5rem 0',
                  fontSize: '0.85rem',
                  color: '#c084fc',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                📄 Generated Tailored ATS Candidate JSON
              </h4>
              {hasJson ? (
                <>
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid #10b981',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      color: '#6ee7b7',
                      marginBottom: '0.8rem',
                    }}
                  >
                    ✅ ATS Candidate JSON generated successfully. Saved in{' '}
                    <code>user_data/{modalAtsResult?.generated_json_file}</code>
                  </div>
                  <pre
                    style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '1rem',
                      fontSize: '0.8rem',
                      maxHeight: '350px',
                      overflowY: 'auto',
                      color: '#a7f3d0',
                    }}
                  >
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
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2rem',
                    color: '#94a3b8',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                  }}
                >
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
              <h4
                style={{
                  margin: 0,
                  fontSize: '0.85rem',
                  color: '#34d399',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                📂 Generated PDF Resume Output & Regeneration
              </h4>

              {/* Session ID & PDF Regeneration Control Box */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  padding: '1rem',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                }}
              >
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
                    onClick={onRegeneratePdf}
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
                  Modify session ID if desired and click Regenerate to re-compile all HTML resume
                  templates into PDF outputs.
                </span>
              </div>

              {hasPdf ? (
                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10b981',
                    borderRadius: '10px',
                    padding: '1.2rem',
                    color: '#ecfdf5',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8rem',
                  }}
                >
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#34d399' }}>
                    🎉 PDF Resume Compiled & Saved!
                  </div>
                  <div style={{ fontSize: '0.85rem' }}>
                    📍 <strong>Output Folder Path:</strong>
                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '6px',
                        marginTop: '0.3rem',
                        fontFamily: 'monospace',
                        color: '#a7f3d0',
                      }}
                    >
                      {modalAtsResult?.output_pdf_folder || `output/resume_${activeModalJobId}`}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
                    📄 <strong>Resume PDF Files Rendered:</strong>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.2rem',
                        marginTop: '0.4rem',
                        color: '#93c5fd',
                      }}
                    >
                      <span>
                        • <code>resume_{activeModalJobId}_resume_template.pdf</code>
                      </span>
                      <span>
                        • <code>resume_{activeModalJobId}_colored_accent_template.pdf</code>
                      </span>
                      <span>
                        • <code>resume_{activeModalJobId}_modern_minimal_template.pdf</code>
                      </span>
                      <span>
                        • <code>resume_{activeModalJobId}_professional_thin_template.pdf</code>
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2rem',
                    color: '#94a3b8',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                  }}
                >
                  🔒 PDF Resume output not generated yet.
                  <div style={{ marginTop: '1rem' }}>
                    <button
                      onClick={onRegeneratePdf}
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
};
