import React from 'react';

interface DirectJdScreenProps {
  directJdTitle: string;
  setDirectJdTitle: (title: string) => void;
  directJdCompany: string;
  setDirectJdCompany: (company: string) => void;
  directJdSessionId: string;
  setDirectJdSessionId: (id: string) => void;
  directJdText: string;
  setDirectJdText: (text: string) => void;
  isProcessingDirectJd: boolean;
  directJdResult: any | null;
  onProcessDirectJd: () => void;
  apiBase: string;
}

export const DirectJdScreen: React.FC<DirectJdScreenProps> = ({
  directJdTitle,
  setDirectJdTitle,
  directJdCompany,
  setDirectJdCompany,
  directJdSessionId,
  setDirectJdSessionId,
  directJdText,
  setDirectJdText,
  isProcessingDirectJd,
  directJdResult,
  onProcessDirectJd,
  apiBase,
}) => {
  return (
    <div
      style={{
        flex: 1,
        padding: '2rem',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Page Header */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '1.5rem',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '1.4rem',
            fontWeight: 700,
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
          }}
        >
          📝 Direct Job Description to ATS Resume & PDF Generator
        </h2>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.88rem', color: '#94a3b8' }}>
          Paste any Job Description text directly below. Our AI will analyze the JD, generate
          tailored candidate ATS JSON data, save the record, compile HTML templates into PDF
          resumes, and offer direct instant download links.
        </p>
      </div>

      {/* Form Card */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.2rem',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#c084fc',
                marginBottom: '0.4rem',
              }}
            >
              💼 Job Title (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Senior Full-Stack Engineer"
              value={directJdTitle}
              onChange={(e) => setDirectJdTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#c084fc',
                marginBottom: '0.4rem',
              }}
            >
              🏢 Company Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Google / Microsoft"
              value={directJdCompany}
              onChange={(e) => setDirectJdCompany(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#c084fc',
                marginBottom: '0.4rem',
              }}
            >
              🏷️ Session ID
            </label>
            <input
              type="text"
              placeholder="Active Session ID"
              value={directJdSessionId}
              onChange={(e) => setDirectJdSessionId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            />
          </div>
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#c084fc',
              marginBottom: '0.4rem',
            }}
          >
            📄 Paste Complete Job Description Text *
          </label>
          <textarea
            rows={10}
            placeholder="Paste raw LinkedIn / Indeed job description text here..."
            value={directJdText}
            onChange={(e) => setDirectJdText(e.target.value)}
            style={{
              width: '100%',
              padding: '0.8rem',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              borderRadius: '8px',
              color: '#f1f5f9',
              fontSize: '0.85rem',
              lineHeight: '1.5',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            disabled={isProcessingDirectJd || !directJdText.trim()}
            onClick={onProcessDirectJd}
            style={{
              background: isProcessingDirectJd
                ? 'rgba(16, 185, 129, 0.5)'
                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              color: '#fff',
              padding: '0.75rem 1.8rem',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: isProcessingDirectJd || !directJdText.trim() ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            {isProcessingDirectJd
              ? '⏳ Processing LLM & Generating PDFs...'
              : '⚡ Process JD -> Generate ATS JSON & PDF'}
          </button>
        </div>
      </div>

      {/* Results View Card */}
      {directJdResult && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid #10b981',
            borderRadius: '14px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
              paddingBottom: '1rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, color: '#34d399', fontSize: '1.1rem', fontWeight: 700 }}>
                🎉 Processing Complete! (Job ID: {directJdResult.job_id})
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.2rem', display: 'block' }}>
                JSON saved in <code>user_data/{directJdResult.generated_json_file}</code> • Output
                Folder: <code>{directJdResult.output_pdf_folder}</code>
              </span>
            </div>
          </div>

          {/* PDF Download Cards Grid */}
          <div>
            <h4
              style={{
                margin: '0 0 0.8rem 0',
                fontSize: '0.9rem',
                color: '#6ee7b7',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              📥 Direct Download Compiled PDF Resumes
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '1rem',
              }}
            >
              {[
                'resume_template.pdf',
                'colored_accent_template.pdf',
                'modern_minimal_template.pdf',
                'professional_thin_template.pdf',
              ].map((tmplName, idx) => {
                const pdfUrl = `${apiBase}/output/resume_${directJdResult.job_id}/resume_${directJdResult.job_id}_${tmplName}`;
                const cleanTitle = tmplName
                  .replace('_template.pdf', '')
                  .replace(/_/g, ' ')
                  .toUpperCase();
                return (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(52, 211, 153, 0.4)',
                      borderRadius: '10px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.8rem',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
                        📄 {cleanTitle} RESUME
                      </div>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: '#94a3b8',
                          marginTop: '0.2rem',
                          fontFamily: 'monospace',
                        }}
                      >
                        resume_{directJdResult.job_id}_{tmplName}
                      </div>
                    </div>
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#ffffff',
                        textAlign: 'center',
                        padding: '0.5rem 0.8rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        textDecoration: 'none',
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      📥 Download PDF
                    </a>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Generated ATS JSON Code Explorer */}
          <div>
            <h4
              style={{
                margin: '0 0 0.5rem 0',
                fontSize: '0.9rem',
                color: '#6ee7b7',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              📄 Saved ATS Candidate JSON
            </h4>
            <pre
              style={{
                background: 'rgba(0, 0, 0, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '1rem',
                fontSize: '0.8rem',
                maxHeight: '350px',
                overflowY: 'auto',
                color: '#a7f3d0',
              }}
            >
              {JSON.stringify(directJdResult.generated_data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
