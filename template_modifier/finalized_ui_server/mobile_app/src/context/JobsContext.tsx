import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { SelectedJob } from '../types';
import { AppStorage, STORAGE_KEYS } from '../utils/storage';
import { api } from '../services/api';

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
  const isInitialMount = useRef<boolean>(true);

  // 1. Initial Load: Restore from local AppStorage & sync with backend server
  useEffect(() => {
    const initSelectedJobs = async () => {
      let localJobs: SelectedJob[] = [];
      try {
        const saved = await AppStorage.getItem(STORAGE_KEYS.SELECTED_JOBS);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localJobs = parsed;
            setSelectedJobs(parsed);
          }
        }
      } catch {
        // fallback
      }

      // Also try syncing from server
      try {
        const baseUrl = await AppStorage.getItem(STORAGE_KEYS.API_BASE_URL);
        if (baseUrl) {
          const serverJobs = await api.getSelectedJobs(baseUrl);
          if (Array.isArray(serverJobs) && serverJobs.length > 0) {
            // Merge unique by jobId
            const ids = new Set(localJobs.map((j) => j.jobId));
            const newFromServer = serverJobs.filter((j: any) => !ids.has(j.jobId));
            const merged = [...localJobs, ...newFromServer];
            setSelectedJobs(merged);
            await AppStorage.setItem(STORAGE_KEYS.SELECTED_JOBS, JSON.stringify(merged));
          }
        }
      } catch {
        // ignore network error on init
      }
    };

    initSelectedJobs();
  }, []);

  // 2. Persist to AppStorage & backend whenever selectedJobs changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const persistJobs = async () => {
      try {
        await AppStorage.setItem(STORAGE_KEYS.SELECTED_JOBS, JSON.stringify(selectedJobs));
        const baseUrl = await AppStorage.getItem(STORAGE_KEYS.API_BASE_URL);
        if (baseUrl) {
          await api.saveSelectedJobs(baseUrl, selectedJobs);
        }
      } catch {
        // ignore
      }
    };

    persistJobs();
  }, [selectedJobs]);

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
