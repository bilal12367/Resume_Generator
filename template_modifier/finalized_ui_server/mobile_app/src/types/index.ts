export interface User {
  id: number;
  name: string;
  email: string;
  created_at?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type JobSource = 'linkedin' | 'naukri';

export type JobWorkflowStatus =
  | 'Basic Information'
  | 'ATS Data Generated'
  | 'PDF Generated'
  | 'Applied';

export interface SearchJobItem {
  job_id: string;
  title: string;
  company_name: string;
  location: string;
  posted_date?: string;
  posted_time?: string;
  experience_level?: string;
  experience?: string;
  job_url?: string;
  job_source?: JobSource | string;
}

export interface SavedJob {
  job_id: string;
  title: string;
  company_name: string;
  location: string;
  posted_time: string;
  num_applicants?: string;
  seniority_level?: string;
  employment_type?: string;
  job_function?: string;
  job_url?: string;
  minimal_description?: string;
  raw_description?: string;
  description?: string;
  skills_required?: string[];
  job_source?: JobSource | string;
  created_at?: string;
  status?: JobWorkflowStatus;
}

export interface SelectedJob {
  jobId: string;
  title?: string;
  company?: string;
  location?: string;
  jobSource?: JobSource | string;
  jobUrl?: string;
  addedAt?: string;
}

export interface UserProfile {
  id: number;
  profile_name: string;
  user_data: string;
  user_data_parsed?: any;
  created_at?: string;
  updated_at?: string;
}

export interface SystemPrompt {
  id: number;
  name: string;
  prompt_text: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PdfLink {
  template_name: string;
  filename: string;
  url: string;
}

export interface GeneratedATSData {
  id?: number;
  profile_id?: number;
  job_id?: string;
  ats_data_parsed?: {
    personal_details?: {
      name?: string;
      email?: string;
      phone?: string;
      title?: string;
      points_to_user?: string; // Actionable technical interview preparation guide
    };
    skills?: string[] | { [key: string]: string[] };
    experience?: Array<{
      title?: string;
      company?: string;
      dates?: string;
      location?: string;
      bullet_points?: string[];
      responsibilities?: string[];
    }>;
    projects?: Array<{
      title?: string;
      name?: string;
      description?: string;
      technologies?: string[] | string;
    }>;
    education?: Array<any>;
    [key: string]: any;
  };
  created_at?: string;
}

export type SessionStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'ATS_GENERATING'
  | 'ATS_COMPLETED'
  | 'PDF_GENERATING'
  | 'PDF_COMPLETED'
  | 'FAILED';

export interface WorkflowSession {
  session_id: string;
  title: string;
  status: SessionStatus;
  profile_id?: number;
  job_id?: string;
  batch_id?: string;
  batch_title?: string;
  job_source?: string;
  job_url?: string;
  pdf_filename?: string;
  pdf_links?: PdfLink[];
  error_message?: string;
  total_tokens?: number;
  processing_time_seconds?: number;
  created_at?: string;
  updated_at?: string;
  generated_ats?: GeneratedATSData;
}

export interface WorkflowBatch {
  batch_id: string;
  batch_title: string;
  total_jobs: number;
  completed_jobs: number;
  status: string;
  total_tokens?: number;
  processing_time_seconds?: number;
  last_updated?: string;
}

export interface SearchFilters {
  platform: JobSource;
  keywords: string;
  location: string;
  experienceLevel: string;
  postedWithin: string;
  limit: number;
  selectedCompanies: string[];
}
