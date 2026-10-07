import React, { useState } from 'react';
import type { SelectedJob } from '../types';

interface SelectedJobsDrawerProps {
  selectedJobs: SelectedJob[];
  onRemoveJob: (jobId: string) => void;
  onClearAll: () => void;
  onViewJob: (jobId: string, jobSource?: string, jobUrl?: string) => void;
}

export const SelectedJobsDrawer: React.FC<SelectedJobsDrawerProps> = ({
  selectedJobs,
  onRemoveJob,
  onClearAll,
  onViewJob,
}) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  if (selectedJobs.length === 0) {
    return null;
  }

  return (
    <div
      className="position-fixed shadow-lg rounded-4 overflow-hidden border border-purple-light"
      style={{
        bottom: '24px',
        right: '24px',
        zIndex: 1060,
        width: '360px',
        backgroundColor: '#1e1e2d',
        color: '#ffffff',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* Header Bar */}
      <div className="d-flex align-items-center justify-content-between p-3 bg-purple text-white border-bottom border-white border-opacity-10">
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-stack fs-5 text-warning"></i>
          <span className="fw-bold fs-7">Selected Jobs</span>
          <span className="badge bg-white text-purple rounded-pill fw-bold fs-8">
            {selectedJobs.length}
          </span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-link text-white-50 p-0 text-decoration-none hover-text-white fs-8 me-1 fw-semibold"
            onClick={onClearAll}
            title="Dismiss all jobs"
          >
            Dismiss all
          </button>
          <button
            type="button"
            className="btn btn-sm text-white p-0 d-flex align-items-center justify-content-center"
            onClick={() => setIsMinimized(!isMinimized)}
            style={{ width: '24px', height: '24px' }}
            title={isMinimized ? 'Expand List' : 'Minimize List'}
          >
            <i className={`bi ${isMinimized ? 'bi-chevron-up' : 'bi-chevron-down'} fs-6`}></i>
          </button>
        </div>
      </div>

      {/* Item Stack List */}
      {!isMinimized && (
        <div
          className="p-2 overflow-auto"
          style={{ maxHeight: '280px', backgroundColor: '#181824' }}
        >
          {selectedJobs.map((job) => (
            <div
              key={job.jobId}
              className="d-flex align-items-center justify-content-between p-2.5 mb-1.5 rounded-3 bg-white bg-opacity-5 border border-white border-opacity-10 hover-bg-opacity-10 transition-all"
            >
              <div
                className="flex-grow-1 min-w-0 me-2 cursor-pointer"
                onClick={() => onViewJob(job.jobId, job.jobSource, job.jobUrl)}
                title="Click to view details"
              >
                <div className="d-flex align-items-center gap-1.5 mb-1">
                  <span className="badge bg-purple-subtle text-purple border border-purple-light fs-9 px-1.5 py-0.5">
                    ID: {job.jobId}
                  </span>
                  {job.company && (
                    <span className="text-white-50 fs-9 text-truncate fw-normal">
                      • {job.company}
                    </span>
                  )}
                </div>
                <div className="text-white fw-medium fs-8 text-truncate">
                  {job.title || `Job Listing ${job.jobId}`}
                </div>
              </div>

              <div className="d-flex align-items-center gap-1">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light border-0 p-1 rounded-circle"
                  onClick={() => onViewJob(job.jobId)}
                  title="View job details"
                  style={{ width: '28px', height: '28px' }}
                >
                  <i className="bi bi-eye fs-7 text-info"></i>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light border-0 p-1 rounded-circle"
                  onClick={() => onRemoveJob(job.jobId)}
                  title="Remove from list"
                  style={{ width: '28px', height: '28px' }}
                >
                  <i className="bi bi-x-lg fs-7 text-danger"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
