import React, { createContext, useContext, useState, ReactNode } from 'react';
import { SelectedJob } from '../types';

interface JobsContextType {
  selectedJobs: SelectedJob[];
  toggleSelectedJob: (job: SelectedJob) => void;
  removeSelectedJob: (jobId: string) => void;
  clearSelectedJobs: () => void;
  isSelected: (jobId: string) => boolean;
  targetWorkflowJob: SelectedJob | null;
  setTargetWorkflowJob: (job: SelectedJob | null) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
}

const JobsContext = createContext<JobsContextType | undefined>(undefined);

export const JobsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedJobs, setSelectedJobs] = useState<SelectedJob[]>([]);
  const [targetWorkflowJob, setTargetWorkflowJob] = useState<SelectedJob | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const toggleSelectedJob = (job: SelectedJob) => {
    setSelectedJobs((prev) => {
      const exists = prev.some((j) => j.jobId === job.jobId);
      if (exists) {
        return prev.filter((j) => j.jobId !== job.jobId);
      } else {
        return [
          ...prev,
          {
            ...job,
            addedAt: new Date().toISOString(),
          },
        ];
      }
    });
  };

  const removeSelectedJob = (jobId: string) => {
    setSelectedJobs((prev) => prev.filter((j) => j.jobId !== jobId));
  };

  const clearSelectedJobs = () => {
    setSelectedJobs([]);
  };

  const isSelected = (jobId: string): boolean => {
    return selectedJobs.some((j) => j.jobId === jobId);
  };

  return (
    <JobsContext.Provider
      value={{
        selectedJobs,
        toggleSelectedJob,
        removeSelectedJob,
        clearSelectedJobs,
        isSelected,
        targetWorkflowJob,
        setTargetWorkflowJob,
        isDrawerOpen,
        setIsDrawerOpen,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
};

export const useJobs = (): JobsContextType => {
  const context = useContext(JobsContext);
  if (!context) {
    throw new Error('useJobs must be used within a JobsProvider');
  }
  return context;
};
