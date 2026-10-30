import {
  User,
  TokenResponse,
  SearchJobItem,
  SavedJob,
  UserProfile,
  WorkflowSession,
  WorkflowBatch,
  JobSource,
} from '../types';

// Default base URL for Android Emulator -> Host machine
export const DEFAULT_API_BASE_URL = 'http://10.0.2.2:8000';

class ApiService {
  private formatUrl(baseUrl: string, endpoint: string): string {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    return `${cleanBase}/${cleanEndpoint}`;
  }

  // --- Health Check ---
  async checkHealth(baseUrl: string): Promise<{ database: string; status: string }> {
    try {
      const url = this.formatUrl(baseUrl, 'health');
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => ({}));
      return {
        database: 'disconnected',
        status: errData.detail || `Server returned HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        database: 'disconnected',
        status: err.message || 'Cannot reach server. Check network / base URL.',
      };
    }
  }

  // --- Authentication ---
  async login(
    baseUrl: string,
    email: string,
    password: string
  ): Promise<TokenResponse> {
    const url = this.formatUrl(baseUrl, 'api/auth/login');
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (err: any) {
      throw new Error(`Network error connecting to ${baseUrl}: ${err.message}`);
    }

    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Login failed (HTTP ${res.status})`);
  }

  async register(
    baseUrl: string,
    name: string,
    email: string,
    password: string
  ): Promise<TokenResponse> {
    const url = this.formatUrl(baseUrl, 'api/auth/register');
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
    } catch (err: any) {
      throw new Error(`Network error connecting to ${baseUrl}: ${err.message}`);
    }

    if (res.ok) {
      const user = await res.json();
      return {
        access_token: `token_${Date.now()}`,
        token_type: 'bearer',
        user: user,
      };
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Registration failed (HTTP ${res.status})`);
  }

  // --- Session Sync (Persists login across app restarts even before native APK rebuild) ---
  async syncActiveSession(baseUrl: string, sessionData: any): Promise<void> {
    try {
      const url = this.formatUrl(baseUrl, 'api/auth/session');
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });
    } catch (e) {
      // ignore
    }
  }

  async fetchActiveSession(baseUrl: string): Promise<any | null> {
    try {
      const url = this.formatUrl(baseUrl, 'api/auth/session');
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.access_token && data.user) {
          return data;
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  async clearActiveSession(baseUrl: string): Promise<void> {
    try {
      const url = this.formatUrl(baseUrl, 'api/auth/session');
      await fetch(url, { method: 'DELETE' });
    } catch (e) {
      // ignore
    }
  }

  // --- Manual Job Search ---
  async searchJobs(
    baseUrl: string,
    platform: JobSource,
    params: {
      keywords: string;
      location: string;
      experienceLevel?: string;
      postedWithin?: string;
      limit?: number;
      pageNo?: number;
    }
  ): Promise<SearchJobItem[]> {
    if (platform === 'naukri') {
      const url = this.formatUrl(baseUrl, 'api/naukri/search');
      const payload = {
        keywords: params.keywords || 'Software Engineer',
        location: params.location || 'Bangalore',
        experience: params.experienceLevel || '',
        pageNo: params.pageNo || 1,
        offset: 0,
        limit: params.limit || 15,
      };

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err: any) {
        throw new Error(`Network error querying Naukri API at ${baseUrl}: ${err.message}`);
      }

      if (res.ok) {
        const data = await res.json();
        return (data.jobs || []).map((j: any) => ({
          ...j,
          job_source: 'naukri',
        }));
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Naukri search returned HTTP ${res.status}`);
    } else {
      const url = this.formatUrl(baseUrl, 'api/linkedin/search');
      const payload = {
        keywords: params.keywords || 'Software Engineer',
        locations: params.location || 'Remote',
        experience_level: params.experienceLevel || '',
        posted_within: params.postedWithin || null,
        offset: 0,
        limit: params.limit || 15,
      };

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err: any) {
        throw new Error(`Network error querying LinkedIn API at ${baseUrl}: ${err.message}`);
      }

      if (res.ok) {
        const data = await res.json();
        return (data.jobs || []).map((j: any) => ({
          ...j,
          job_source: 'linkedin',
        }));
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `LinkedIn search returned HTTP ${res.status}`);
    }
  }

  // --- Job Details ---
  async getJobDetails(
    baseUrl: string,
    jobId: string,
    jobSource: string = 'linkedin',
    jobUrl?: string
  ): Promise<any> {
    const isNaukri = jobSource === 'naukri';
    let endpoint = isNaukri
      ? `api/naukri/jobs/details/${jobId}`
      : `api/linkedin/jobs/details/${jobId}`;

    if (isNaukri && jobUrl) {
      endpoint += `?job_url=${encodeURIComponent(jobUrl)}`;
    }

    const url = this.formatUrl(baseUrl, endpoint);
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err: any) {
      throw new Error(`Network error loading job details: ${err.message}`);
    }

    if (res.ok) {
      const data = await res.json();
      return data.job || data;
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to fetch job details (${res.status})`);
  }

  // --- Saved Jobs List ---
  async getSavedJobs(baseUrl: string): Promise<SavedJob[]> {
    const lUrl = this.formatUrl(baseUrl, 'api/linkedin/jobs/saved');
    const nUrl = this.formatUrl(baseUrl, 'api/naukri/jobs/saved');

    let lRes: PromiseSettledResult<Response>;
    let nRes: PromiseSettledResult<Response>;

    try {
      [lRes, nRes] = await Promise.allSettled([fetch(lUrl), fetch(nUrl)]);
    } catch (err: any) {
      throw new Error(`Network error loading saved jobs: ${err.message}`);
    }

    let combined: SavedJob[] = [];
    const errors: string[] = [];

    if (lRes.status === 'fulfilled') {
      if (lRes.value.ok) {
        const lData = await lRes.value.json();
        const lJobs = (lData.jobs || []).map((j: any) => ({
          ...j,
          job_source: 'linkedin',
        }));
        combined = combined.concat(lJobs);
      } else {
        const errJson = await lRes.value.json().catch(() => ({}));
        errors.push(`LinkedIn: ${errJson.detail || `HTTP ${lRes.value.status}`}`);
      }
    } else {
      errors.push(`LinkedIn: ${lRes.reason?.message || 'Network request failed'}`);
    }

    if (nRes.status === 'fulfilled') {
      if (nRes.value.ok) {
        const nData = await nRes.value.json();
        const nJobs = (nData.jobs || []).map((j: any) => ({
          ...j,
          job_source: 'naukri',
        }));
        combined = combined.concat(nJobs);
      } else {
        const errJson = await nRes.value.json().catch(() => ({}));
        errors.push(`Naukri: ${errJson.detail || `HTTP ${nRes.value.status}`}`);
      }
    } else {
      errors.push(`Naukri: ${nRes.reason?.message || 'Network request failed'}`);
    }

    // If both failed or errors occurred with 0 results, throw real error
    if (combined.length === 0 && errors.length > 0) {
      throw new Error(`Failed to load saved jobs: ${errors.join(' | ')}`);
    }

    return combined;
  }

  // --- User Profiles ---
  async getUserProfiles(baseUrl: string): Promise<UserProfile[]> {
    const url = this.formatUrl(baseUrl, 'api/workflow/profiles');
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err: any) {
      throw new Error(`Network error loading user profiles: ${err.message}`);
    }

    if (res.ok) {
      const data = await res.json();
      return data.profiles || [];
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to load user profiles (HTTP ${res.status})`);
  }

  // --- Workflow Sessions ---
  async getWorkflowSessions(baseUrl: string): Promise<WorkflowSession[]> {
    const url = this.formatUrl(baseUrl, 'api/workflow/sessions');
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err: any) {
      throw new Error(`Network error loading workflow sessions: ${err.message}`);
    }

    if (res.ok) {
      const data = await res.json();
      return data.sessions || [];
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to fetch sessions (HTTP ${res.status})`);
  }

  async getWorkflowSessionDetails(baseUrl: string, sessionId: string): Promise<WorkflowSession> {
    const url = this.formatUrl(baseUrl, `api/workflow/sessions/${sessionId}`);
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err: any) {
      throw new Error(`Network error loading session ${sessionId}: ${err.message}`);
    }

    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to load session ${sessionId} (HTTP ${res.status})`);
  }

  async createWorkflowSession(
    baseUrl: string,
    title?: string,
    jobId?: string,
    profileId?: number
  ): Promise<WorkflowSession> {
    const url = this.formatUrl(baseUrl, 'api/workflow/sessions');
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || `Session ${Date.now()}`,
          job_id: jobId,
          profile_id: profileId,
        }),
      });
    } catch (err: any) {
      throw new Error(`Network error creating workflow session: ${err.message}`);
    }

    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to create workflow session (HTTP ${res.status})`);
  }

  async deleteWorkflowSession(baseUrl: string, sessionId: string): Promise<void> {
    const url = this.formatUrl(baseUrl, `api/workflow/sessions/${sessionId}`);
    let res: Response;
    try {
      res = await fetch(url, { method: 'DELETE' });
    } catch (err: any) {
      throw new Error(`Network error deleting session: ${err.message}`);
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Failed to delete session (HTTP ${res.status})`);
    }
  }

  async runATSWorkflow(
    baseUrl: string,
    sessionId: string,
    payload: {
      profile_id?: number;
      job_id?: string;
      custom_user_data?: string;
      job_description_text?: string;
    }
  ): Promise<any> {
    const url = this.formatUrl(baseUrl, `api/workflow/sessions/${sessionId}/run-ats`);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      throw new Error(`Network error running ATS workflow: ${err.message}`);
    }

    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `ATS Workflow failed (HTTP ${res.status})`);
  }

  async updateATSData(baseUrl: string, sessionId: string, atsData: any): Promise<any> {
    const url = this.formatUrl(baseUrl, `api/workflow/sessions/${sessionId}/ats`);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ats_data: atsData }),
      });
    } catch (err: any) {
      throw new Error(`Network error updating ATS data: ${err.message}`);
    }

    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to update ATS data (HTTP ${res.status})`);
  }

  async generatePDFs(
    baseUrl: string,
    sessionId: string,
    filename: string
  ): Promise<{ status: string; pdf_links?: any[] }> {
    const url = this.formatUrl(baseUrl, `api/workflow/sessions/${sessionId}/generate-pdf`);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
    } catch (err: any) {
      throw new Error(`Network error generating PDFs: ${err.message}`);
    }

    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `PDF generation failed (HTTP ${res.status})`);
  }

  async runBatchATS(
    baseUrl: string,
    profileId: number,
    jobs: Array<{ job_id: string; title: string; company_name: string; job_source?: string; job_url?: string }>
  ): Promise<any> {
    const url = this.formatUrl(baseUrl, 'api/workflow/batches/run-ats');
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileId,
          jobs: jobs,
          max_concurrency: 3,
        }),
      });
    } catch (err: any) {
      throw new Error(`Network error running batch ATS: ${err.message}`);
    }

    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to execute batch workflow (HTTP ${res.status})`);
  }

  async getWorkflowBatches(baseUrl: string): Promise<WorkflowBatch[]> {
    const url = this.formatUrl(baseUrl, 'api/workflow/batches');
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err: any) {
      throw new Error(`Network error loading batches: ${err.message}`);
    }

    if (res.ok) {
      const data = await res.json();
      return data.batches || [];
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to load batches (HTTP ${res.status})`);
  }
}

export const api = new ApiService();
