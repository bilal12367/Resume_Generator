import React, { useState } from 'react';
import type { JobApplication } from '../types';

interface JobsPageProps {
  jobs: JobApplication[];
  onViewJob?: (jobId: string) => void;
}

export const JobsPage: React.FC<JobsPageProps> = ({ jobs, onViewJob }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');

  const filteredJobs = jobs.filter(j => {
    const matchesQuery = j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         j.company.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'All' || j.status === filterStatus;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="d-flex flex-column gap-4">
      <div className="card-modern p-4 mb-2">
        <div className="row g-3 align-items-center">
          <div className="col-md-4">
            <div className="input-group">
              <span className="input-group-text bg-light border-end-0">
                <i className="bi bi-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control border-start-0"
                placeholder="Search title or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Status filtering tabs */}
          <div className="col-md-8">
            <div className="d-flex flex-wrap gap-2 justify-content-md-end">
              {['All', 'Basic Information', 'ATS Data Generated', 'PDF Generated', 'Applied'].map(st => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`btn btn-sm ${filterStatus === st ? 'btn-purple' : 'btn-outline-purple'}`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="card-modern p-4">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="border-bottom">
              <tr>
                <th>Job ID</th>
                <th>Job Title</th>
                <th>Company</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => (
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
