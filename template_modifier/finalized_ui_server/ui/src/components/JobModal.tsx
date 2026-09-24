import React from 'react';

interface JobModalProps {
  show: boolean;
  jobData: any;
  loading: boolean;
  onClose: () => void;
  onStartWorkflow?: (jobId: string) => void;
}

const formatPostedDate = (rawTime?: string): string => {
  if (!rawTime) return 'Recently posted';
  const val = rawTime.trim();
  if (val.toLowerCase().includes('ago')) return val;
  if (val.toLowerCase().includes('24h') || val.toLowerCase() === '1d') return '1 day ago';
  if (val.toLowerCase() === 'today' || val.toLowerCase() === 'just now') return 'Today';

  const numMatch = val.match(/^(\d+)\s*d(ays?)?$/i);
  if (numMatch) return `${numMatch[1]} day${numMatch[1] === '1' ? '' : 's'} ago`;

  const hourMatch = val.match(/^(\d+)\s*h(ours?)?$/i);
  if (hourMatch) return `${hourMatch[1]} hour${hourMatch[1] === '1' ? '' : 's'} ago`;

  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  }
  return val;
};

export const JobModal: React.FC<JobModalProps> = ({ show, jobData, loading, onClose, onStartWorkflow }) => {
  if (!show) return null;

  const company = jobData?.company_name || jobData?.company || 'LinkedIn Posting';
  const location = jobData?.location || 'Remote';
  const postedDateFormatted = formatPostedDate(jobData?.posted_time || jobData?.created_at || jobData?.posted_within);
  const experienceLevel = jobData?.seniority_level || jobData?.experience_level || jobData?.experience || 'Not specified';
  const numApplicants = jobData?.num_applicants;
  const employmentType = jobData?.employment_type;
  const jobFunction = jobData?.job_function;

  return (
    <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
          <div className="modal-header bg-purple text-white border-0 p-4">
            <div className="d-flex align-items-center gap-3">
              <div className="p-2 bg-white bg-opacity-20 rounded-3">
                <i className="bi bi-briefcase-fill fs-3 text-white"></i>
              </div>
              <div>
                <h5 className="modal-title fw-bold mb-1">
                  {loading ? 'Fetching LinkedIn Job Details...' : (jobData?.title || 'Job Details')}
                </h5>
                <small className="text-white-50">
                  Job ID: {jobData?.job_id || 'N/A'}
                </small>
              </div>
            </div>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>

          <div className="modal-body p-4 max-h-70vh overflow-auto">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-purple mb-3" style={{ width: '3rem', height: '3rem' }} role="status"></div>
                <p className="text-muted fw-bold">Connecting to LinkedIn & fetching live job metadata...</p>
              </div>
            ) : jobData ? (
              <div className="d-flex flex-column gap-4">

                {/* Highlighted Metadata Cards (Company, Posted Date, Experience, Location) */}
                <div className="row g-3">
                  {/* Company Card */}
                  <div className="col-sm-6 col-md-3">
                    <div className="p-3 bg-light border border-purple-light rounded-3 h-100 d-flex flex-column">
                      <small className="text-muted text-uppercase fw-bold fs-9 mb-1">
                        <i className="bi bi-building me-1 text-purple"></i> Company
                      </small>
                      <strong className="text-dark fs-7 text-truncate">{company}</strong>
                    </div>
                  </div>

                  {/* Location Card */}
                  <div className="col-sm-6 col-md-3">
                    <div className="p-3 bg-light border border-purple-light rounded-3 h-100 d-flex flex-column">
                      <small className="text-muted text-uppercase fw-bold fs-9 mb-1">
                        <i className="bi bi-geo-alt-fill me-1 text-danger"></i> Location
                      </small>
                      <strong className="text-dark fs-7 text-truncate">{location}</strong>
                    </div>
                  </div>

                  {/* Posted Date Card (Days ago format) */}
                  <div className="col-sm-6 col-md-3">
                    <div className="p-3 bg-light border border-purple-light rounded-3 h-100 d-flex flex-column">
                      <small className="text-muted text-uppercase fw-bold fs-9 mb-1">
                        <i className="bi bi-clock-history me-1 text-info"></i> Posted Date
                      </small>
                      <strong className="text-purple fs-7 text-truncate">{postedDateFormatted}</strong>
                    </div>
                  </div>

                  {/* Experience Level Card */}
                  <div className="col-sm-6 col-md-3">
                    <div className="p-3 bg-light border border-purple-light rounded-3 h-100 d-flex flex-column">
                      <small className="text-muted text-uppercase fw-bold fs-9 mb-1">
                        <i className="bi bi-award-fill me-1 text-warning"></i> Experience
                      </small>
                      <strong className="text-dark fs-7 text-truncate">{experienceLevel}</strong>
                    </div>
                  </div>
                </div>

                {/* Additional Secondary Metadata Badges */}
                {(numApplicants || employmentType || jobFunction) && (
                  <div className="d-flex flex-wrap gap-2 p-2 bg-purple-subtle rounded-3 border border-purple-light">
                    {numApplicants && (
                      <span className="badge bg-white text-dark border py-1.5 px-3">
                        <i className="bi bi-people-fill me-1 text-purple"></i> Applicants: <strong>{numApplicants}</strong>
                      </span>
                    )}
                    {employmentType && (
                      <span className="badge bg-white text-dark border py-1.5 px-3">
                        <i className="bi bi-briefcase me-1 text-purple"></i> Type: <strong>{employmentType}</strong>
                      </span>
                    )}
                    {jobFunction && (
                      <span className="badge bg-white text-dark border py-1.5 px-3">
                        <i className="bi bi-layers-fill me-1 text-purple"></i> Function: <strong>{jobFunction}</strong>
                      </span>
                    )}
                  </div>
                )}

                {/* Extracted Skills */}
                {jobData.skills_required && Array.isArray(jobData.skills_required) && jobData.skills_required.length > 0 && (
                  <div>
                    <h6 className="fw-bold text-purple mb-2">
                      <i className="bi bi-stars me-1"></i> Key Skills & Qualifications Required:
                    </h6>
                    <div className="d-flex flex-wrap gap-2">
                      {jobData.skills_required.map((sk: string, i: number) => (
                        <span key={i} className="badge bg-purple-subtle text-purple border border-purple-light py-2 px-3 fs-8">
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Job Description Text */}
                <div>
                  <h6 className="fw-bold text-dark mb-2">
                    <i className="bi bi-file-text-fill text-purple me-1"></i> Role Description:
                  </h6>
                  <div
                    className="p-3 bg-light rounded-3 text-secondary fs-7 leading-relaxed"
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                  >
                    {jobData.minimal_description || jobData.raw_description || jobData.description || 'No description body available.'}
                  </div>
                </div>

                {/* Direct LinkedIn URL Button */}
                {jobData.job_url && (
                  <div className="pt-2">
                    <a
                      href={jobData.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline-purple w-100 fw-bold d-flex align-items-center justify-content-center gap-2"
                    >
                      <span>View Full Job Listing on LinkedIn</span>
                      <i className="bi bi-box-arrow-up-right"></i>
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="alert alert-warning">No details found for this Job ID.</div>
            )}
          </div>

          <div className="modal-footer bg-light border-0 p-3 d-flex align-items-center justify-content-between">
            <div>
              {onStartWorkflow && jobData && (jobData.job_id || jobData.id) && (
                <button
                  type="button"
                  className="btn btn-purple px-4 fw-bold d-flex align-items-center gap-2 shadow-sm"
                  onClick={() => {
                    const targetJobId = jobData.job_id || jobData.id;
                    onClose();
                    onStartWorkflow(targetJobId);
                  }}
                >
                  <i className="bi bi-gear-wide-connected fs-5"></i>
                  <span>Process through ATS Workflow</span>
                </button>
              )}
            </div>
            <button type="button" className="btn btn-secondary px-4 fw-bold" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

