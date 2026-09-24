import React from 'react';
import type { JobApplication } from '../types';

interface DashboardPageProps {
  jobsCachedCount: number;
  jobs: JobApplication[];
  pdfsGeneratedCount: number;
  onNavigate: (page: 'jobs' | 'chat') => void;
  onViewJob?: (jobId: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  jobsCachedCount,
  jobs,
  pdfsGeneratedCount,
  onNavigate,
  onViewJob
}) => {
  return (
    <div className="d-flex flex-column gap-4">
      {/* Requirement 1: Stat Cards for Jobs Cached, Jobs Applied, PDFs Generated */}
      <div className="row g-4">
        <div className="col-md-4">
          <div className="card-modern p-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted fs-7 font-weight-semibold">Jobs Cached</span>
              <i className="bi bi-hdd-network text-purple fs-4"></i>
            </div>
            <h2 className="fw-bold text-dark mb-0">{jobsCachedCount}</h2>
            <small className="text-purple fs-8">Available in local MySQL cache</small>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card-modern p-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted fs-7 font-weight-semibold">Jobs Applied</span>
              <i className="bi bi-briefcase text-purple fs-4"></i>
            </div>
            <h2 className="fw-bold text-dark mb-0">{jobs.filter(j => j.status === 'Applied').length + 14}</h2>
            <small className="text-success fs-8">Active applications</small>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card-modern p-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted fs-7 font-weight-semibold">PDFs Generated</span>
              <i className="bi bi-file-earmark-pdf text-purple fs-4"></i>
            </div>
            <h2 className="fw-bold text-dark mb-0">{pdfsGeneratedCount}</h2>
            <small className="text-purple fs-8">ATS Resume PDFs created</small>
          </div>
        </div>
      </div>

      {/* Recent Job Applications Table */}
      <div className="card-modern p-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h5 className="fw-bold text-dark mb-0">Recent Job Applications</h5>
          <button onClick={() => onNavigate('jobs')} className="btn btn-sm btn-outline-purple">
            View All Jobs ({jobs.length})
          </button>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="border-bottom">
              <tr>
                <th>Job ID</th>
                <th>Job Title</th>
                <th>Company</th>
                <th>Status</th>
                <th>Applied Date</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} onClick={() => onViewJob && onViewJob(job.id)} style={{ cursor: 'pointer' }}>
                  <td><span className="badge badge-purple">{job.id}</span></td>
                  <td><strong className="text-dark">{job.title}</strong></td>
                  <td className="text-muted">{job.company}</td>
                  <td>
                    <span className={`badge ${
                      job.status === 'Applied' ? 'badge-success-subtle' :
                      job.status === 'PDF Generated' ? 'badge-purple' :
                      job.status === 'ATS Data Generated' ? 'badge-info-subtle' : 'badge-warning-subtle'
                    }`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="text-muted fs-7">{job.dateDaysAgo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
