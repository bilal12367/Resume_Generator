import React, { useState, useEffect } from 'react';
import type { User } from '../types';

interface UserProfile {
  id: number;
  profile_name: string;
  user_data: string;
  user_data_parsed?: any;
  created_at?: string;
  updated_at?: string;
}

interface ProfilePageProps {
  user: User;
  onUpdateUser: (updated: Partial<User>) => void;
  API_BASE_URL: string;
}

const DEFAULT_SAMPLE_RESUME_JSON = {
  personal_details: {
    name: "Bilal Applicant",
    title: "Senior AI & Python Engineer",
    location: "Hyderabad, Telangana, India",
    phone: "+91-9876543210",
    email: "bilal@example.com",
    linkedin: "https://linkedin.com/in/bilal-ai",
    github: "https://github.com/bilal12367",
    points_to_user: "Focus on LLM agent frameworks and Playwright web automation."
  },
  cover_letter: {
    salutation: "Dear Hiring Manager,",
    objective: "Passionate Senior AI Engineer specializing in LLM agents, FastAPI microservices, and automated ATS resume optimization."
  },
  experience: [
    {
      role: "Senior AI & Full Stack Developer",
      company: "DataMind Automation",
      location: "Hyderabad, India",
      dates: "2022 - Present",
      highlights: [
        "Architected ReAct AI agent workflow using SiliconFlow Qwen2.5-72B and LlamaIndex.",
        "Engineered Playwright automation service for live LinkedIn job scraping and caching in MySQL.",
        "Built responsive real-time delta streaming chat interface over Centrifugo WebSockets."
      ]
    }
  ],
  projects: [
    {
      name: "AI Resume & ATS Optimization Engine",
      tech_stack: "Python, FastAPI, MySQL, Jinja2, Playwright, React, TypeScript",
      highlights: [
        "Automated Jinja2 HTML template rendering and headless PDF generation using Playwright."
      ]
    }
  ],
  skills: [
    {
      category: "Programming & Frameworks",
      items: ["Python", "FastAPI", "React", "TypeScript", "SQLAlchemy", "Asyncio"]
    },
    {
      category: "AI & Automation",
      items: ["LlamaIndex", "SiliconFlow", "Playwright", "Centrifugo", "MySQL"]
    }
  ],
  education: [
    {
      degree: "B.Tech in Computer Science & Engineering",
      institution: "National Institute of Technology",
      dates: "2018 - 2022"
    }
  ],
  certifications: ["AWS Certified AI Practitioner", "Azure AI Engineer Associate"]
};

interface SystemPrompt {
  id: number;
  name: string;
  prompt_text: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ user, onUpdateUser, API_BASE_URL }) => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'candidate_profiles' | 'system_prompts'>('candidate_profiles');

  // Account Info State
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [savedAccount, setSavedAccount] = useState(false);

  // Resume Profiles State
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState<boolean>(true);

  // Resume Form State
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [userDataText, setUserDataText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  // System Prompts State
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [loadingSystemPrompts, setLoadingSystemPrompts] = useState<boolean>(true);
  const [editingPromptId, setEditingPromptId] = useState<number | null>(null);
  const [promptName, setPromptName] = useState<string>('');
  const [promptText, setPromptText] = useState<string>('');
  const [promptIsDefault, setPromptIsDefault] = useState<boolean>(false);
  const [savingPrompt, setSavingPrompt] = useState<boolean>(false);
  const [promptSaveSuccessMsg, setPromptSaveSuccessMsg] = useState<string | null>(null);

  // Fetch profiles from backend database
  const fetchProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/profiles`);
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
      }
    } catch (err) {
      console.error("Failed to fetch profiles:", err);
    } finally {
      setLoadingProfiles(false);
    }
  };

  // Fetch system prompts from backend database
  const fetchSystemPrompts = async () => {
    setLoadingSystemPrompts(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/linkedin/system-prompts`);
      if (res.ok) {
        const data = await res.json();
        setSystemPrompts(data.prompts || []);
      }
    } catch (err) {
      console.error("Failed to fetch system prompts:", err);
    } finally {
      setLoadingSystemPrompts(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
    fetchSystemPrompts();
  }, [API_BASE_URL]);

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateUser({ name, email });
    setSavedAccount(true);
    setTimeout(() => setSavedAccount(false), 3000);
  };

  const handleLoadSampleJSON = () => {
    setUserDataText(JSON.stringify(DEFAULT_SAMPLE_RESUME_JSON, null, 2));
    setJsonError(null);
  };

  const handleFormatJSON = () => {
    try {
      const parsed = JSON.parse(userDataText);
      setUserDataText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (e: any) {
      setJsonError(`Invalid JSON format: ${e.message}`);
    }
  };

  const handleStartNewProfile = () => {
    setEditingProfileId(null);
    setProfileName('New Resume Candidate Profile');
    setUserDataText(JSON.stringify(DEFAULT_SAMPLE_RESUME_JSON, null, 2));
    setJsonError(null);
    setSaveSuccessMsg(null);
  };

  const handleEditProfile = (prof: UserProfile) => {
    setEditingProfileId(prof.id);
    setProfileName(prof.profile_name);
    if (typeof prof.user_data === 'string') {
      try {
        const parsed = JSON.parse(prof.user_data);
        setUserDataText(JSON.stringify(parsed, null, 2));
      } catch (e) {
        setUserDataText(prof.user_data);
      }
    } else {
      setUserDataText(JSON.stringify(prof.user_data, null, 2));
    }
    setJsonError(null);
    setSaveSuccessMsg(null);
  };

  const handleDeleteProfile = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this profile?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/profiles/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProfiles();
        if (editingProfileId === id) {
          handleStartNewProfile();
        }
      }
    } catch (err) {
      console.error("Failed to delete profile:", err);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      alert("Please enter a profile name.");
      return;
    }

    let payloadData: any = userDataText.trim();
    try {
      payloadData = JSON.parse(userDataText);
      setJsonError(null);
    } catch (e) {
      // Allowed if free text
    }

    setSavingProfile(true);
    try {
      if (editingProfileId) {
        const res = await fetch(`${API_BASE_URL}/api/workflow/profiles/${editingProfileId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_name: profileName,
            user_data: payloadData
          })
        });
        if (res.ok) {
          setSaveSuccessMsg(`Profile "${profileName}" updated successfully!`);
          fetchProfiles();
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/api/workflow/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_name: profileName,
            user_data: payloadData
          })
        });
        if (res.ok) {
          const data = await res.json();
          setSaveSuccessMsg(`Profile "${profileName}" created successfully!`);
          setEditingProfileId(data.profile_id);
          fetchProfiles();
        }
      }
    } catch (err) {
      console.error("Save profile error:", err);
      alert("Failed to save profile.");
    } finally {
      setSavingProfile(false);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    }
  };

  // System Prompt Handlers
  const handleStartNewPrompt = () => {
    setEditingPromptId(null);
    setPromptName('');
    setPromptText('');
    setPromptIsDefault(false);
    setPromptSaveSuccessMsg(null);
  };

  const handleEditPrompt = (sp: SystemPrompt) => {
    setEditingPromptId(sp.id);
    setPromptName(sp.name);
    setPromptText(sp.prompt_text);
    setPromptIsDefault(sp.is_default);
    setPromptSaveSuccessMsg(null);
  };

  const handleSavePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptName.trim() || !promptText.trim()) {
      alert("Please provide both prompt name and instructions.");
      return;
    }

    setSavingPrompt(true);
    try {
      if (editingPromptId) {
        const res = await fetch(`${API_BASE_URL}/api/linkedin/system-prompts/${editingPromptId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: promptName,
            prompt_text: promptText,
            is_default: promptIsDefault
          })
        });
        if (res.ok) {
          setPromptSaveSuccessMsg(`System prompt "${promptName}" updated!`);
          fetchSystemPrompts();
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/api/linkedin/system-prompts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: promptName,
            prompt_text: promptText,
            is_default: promptIsDefault
          })
        });
        if (res.ok) {
          const data = await res.json();
          setPromptSaveSuccessMsg(`System prompt "${promptName}" created!`);
          if (data.prompt) setEditingPromptId(data.prompt.id);
          fetchSystemPrompts();
        }
      }
    } catch (err) {
      console.error("Save system prompt error:", err);
      alert("Failed to save system prompt.");
    } finally {
      setSavingPrompt(false);
      setTimeout(() => setPromptSaveSuccessMsg(null), 4000);
    }
  };

  const handleDeletePrompt = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this system prompt?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/linkedin/system-prompts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSystemPrompts();
        if (editingPromptId === id) handleStartNewPrompt();
      }
    } catch (err) {
      console.error("Delete prompt error:", err);
    }
  };

  const handleSetDefaultPrompt = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/linkedin/system-prompts/${id}/set-default`, { method: 'POST' });
      if (res.ok) {
        fetchSystemPrompts();
      }
    } catch (err) {
      console.error("Set default prompt error:", err);
    }
  };

  return (
    <div className="p-4 d-flex flex-column gap-4 maxWidth-xl mx-auto" style={{ maxWidth: '1100px' }}>
      {/* Page Header */}
      <div className="card-modern p-4 bg-purple-gradient text-white border-0 shadow-sm">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <h4 className="fw-bold mb-1">
              <i className="bi bi-gear-fill me-2"></i> User Settings & Prompts Management
            </h4>
            <p className="mb-0 text-white-50 fs-7">
              Manage your profile, ATS candidate data schemas, and agent System Prompts applied before conversations.
            </p>
          </div>
          {activeTab === 'candidate_profiles' ? (
            <button onClick={handleStartNewProfile} className="btn btn-light text-purple fw-bold shadow-sm d-flex align-items-center gap-2">
              <i className="bi bi-plus-lg"></i>
              <span>Create New Profile</span>
            </button>
          ) : (
            <button onClick={handleStartNewPrompt} className="btn btn-light text-purple fw-bold shadow-sm d-flex align-items-center gap-2">
              <i className="bi bi-plus-lg"></i>
              <span>Create New System Prompt</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="d-flex border-bottom gap-2">
        <button
          onClick={() => setActiveTab('candidate_profiles')}
          className={`btn rounded-top-3 rounded-bottom-0 fw-semibold px-4 py-2 border-bottom-0 transition ${
            activeTab === 'candidate_profiles'
              ? 'btn-purple text-white'
              : 'btn-light text-secondary border'
          }`}
        >
          <i className="bi bi-person-lines-fill me-2"></i>
          <span>Candidate Profiles</span>
          <span className="badge bg-white text-purple ms-2 fs-9">{profiles.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('system_prompts')}
          className={`btn rounded-top-3 rounded-bottom-0 fw-semibold px-4 py-2 border-bottom-0 transition ${
            activeTab === 'system_prompts'
              ? 'btn-purple text-white'
              : 'btn-light text-secondary border'
          }`}
        >
          <i className="bi bi-chat-left-quote-fill me-2"></i>
          <span>System Prompts</span>
          <span className="badge bg-white text-purple ms-2 fs-9">{systemPrompts.length}</span>
        </button>
      </div>

      {/* TAB 1: Candidate Profiles & Account */}
      {activeTab === 'candidate_profiles' && (
        <div className="row g-4">
          {/* Left Column: Saved Profiles List & Account Info */}
          <div className="col-lg-4 d-flex flex-column gap-4">
            {/* Account Details Card */}
            <div className="card-modern p-4 shadow-sm">
              <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                <i className="bi bi-person-badge text-purple fs-5"></i>
                <span>Account Credentials</span>
              </h6>
              {savedAccount && (
                <div className="alert alert-success p-2 fs-8 rounded-3 mb-3">
                  <i className="bi bi-check-circle me-1"></i> Saved!
                </div>
              )}
              <form onSubmit={handleAccountSubmit} className="d-flex flex-column gap-3">
                <div>
                  <label className="fs-8 fw-semibold text-muted mb-1 d-block">Full Name</label>
                  <input
                    type="text"
                    className="form-control form-control-sm fs-7"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="fs-8 fw-semibold text-muted mb-1 d-block">Email Address</label>
                  <input
                    type="email"
                    className="form-control form-control-sm fs-7"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-sm btn-outline-purple fw-bold mt-1">
                  Update Account
                </button>
              </form>
            </div>

            {/* Saved Candidate Profiles List */}
            <div className="card-modern p-4 shadow-sm flex-grow-1">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                  <i className="bi bi-folder-fill text-purple fs-5"></i>
                  <span>Saved Candidate Profiles</span>
                </h6>
                <span className="badge badge-purple fs-8">{profiles.length}</span>
              </div>

              {loadingProfiles ? (
                <div className="text-center py-4">
                  <div className="spinner-border spinner-border-sm text-purple" role="status"></div>
                  <small className="text-muted d-block mt-2">Loading profiles...</small>
                </div>
              ) : profiles.length === 0 ? (
                <div className="p-3 text-center text-muted bg-light rounded-3 fs-8">
                  No resume profiles created yet. Click "Create New Profile" to add one.
                </div>
              ) : (
                <div className="d-flex flex-column gap-2 overflow-auto" style={{ maxHeight: '420px' }}>
                  {profiles.map((prof) => (
                    <div
                      key={prof.id}
                      onClick={() => handleEditProfile(prof)}
                      className={`p-3 rounded-3 cursor-pointer border transition ${
                        editingProfileId === prof.id
                          ? 'bg-purple-subtle border-purple text-purple fw-semibold shadow-sm'
                          : 'bg-white border-light hover-bg-light text-dark'
                      }`}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="fs-7 text-truncate me-2" style={{ maxWidth: '180px' }}>
                          <i className="bi bi-file-earmark-person me-1.5"></i>
                          {prof.profile_name}
                        </span>
                        <div className="d-flex align-items-center gap-1">
                          <span className="badge bg-light text-purple font-monospace fs-9">ID: {prof.id}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProfile(prof.id);
                            }}
                            className="btn btn-sm text-danger p-0 border-0 ms-1"
                            title="Delete Profile"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </div>
                      <small className="text-muted fs-9 d-block">
                        Updated: {prof.updated_at ? new Date(prof.updated_at).toLocaleDateString() : 'Recently'}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Profile Editor Form */}
          <div className="col-lg-8">
            <div className="card-modern p-4 shadow-sm h-100 d-flex flex-column">
              <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                <div>
                  <h5 className="fw-bold text-dark mb-1">
                    {editingProfileId ? `Edit Candidate Profile (ID: ${editingProfileId})` : 'Create New Candidate Profile'}
                  </h5>
                  <p className="text-muted fs-7 mb-0">
                    This user data JSON or free text will be fed as <code>user_data</code> into ATS Optimization workflows.
                  </p>
                </div>

                <div className="d-flex gap-2">
                  <button
                    type="button"
                    onClick={handleLoadSampleJSON}
                    className="btn btn-sm btn-outline-purple d-flex align-items-center gap-1"
                    title="Insert default candidate resume JSON template"
                  >
                    <i className="bi bi-magic"></i>
                    <span>Load Sample JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFormatJSON}
                    className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                    title="Format and validate JSON string"
                  >
                    <i className="bi bi-code-slash"></i>
                    <span>Format JSON</span>
                  </button>
                </div>
              </div>

              {saveSuccessMsg && (
                <div className="alert alert-success d-flex align-items-center gap-2 p-3 rounded-3 mb-3">
                  <i className="bi bi-check-circle-fill fs-5"></i>
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {jsonError && (
                <div className="alert alert-danger d-flex align-items-center gap-2 p-2.5 rounded-3 mb-3 fs-8">
                  <i className="bi bi-exclamation-triangle-fill"></i>
                  <span>{jsonError}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="flex-grow-1 d-flex flex-column gap-3">
                <div>
                  <label className="fs-8 fw-bold text-muted mb-1 d-block">Candidate Profile Title / Name:</label>
                  <input
                    type="text"
                    className="form-control fs-7 rounded-3 p-2.5"
                    placeholder="e.g. Senior AI Engineer Resume Profile"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    required
                  />
                </div>

                <div className="flex-grow-1 d-flex flex-column">
                  <label className="fs-8 fw-bold text-muted mb-1 d-block">
                    Candidate Data (JSON or Free Text):
                  </label>
                  <textarea
                    className="form-control font-monospace fs-8 p-3 flex-grow-1 rounded-3 bg-dark text-light border-secondary"
                    style={{ minHeight: '380px', tabSize: 2, lineHeight: 1.5 }}
                    placeholder="Paste candidate JSON schema or free text resume here..."
                    value={userDataText}
                    onChange={(e) => setUserDataText(e.target.value)}
                    required
                  />
                </div>

                <div className="pt-3 border-top d-flex justify-content-between align-items-center">
                  <small className="text-muted fs-8">
                    <i className="bi bi-info-circle me-1"></i> Data saved here can be selected by Profile ID in the Workflow page.
                  </small>

                  <div className="d-flex gap-2">
                    {editingProfileId && (
                      <button
                        type="button"
                        onClick={handleStartNewProfile}
                        className="btn btn-outline-secondary btn-sm"
                      >
                        Cancel Edit
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="btn btn-purple px-4 fw-bold rounded-3 d-flex align-items-center gap-2"
                    >
                      {savingProfile ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status"></span>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <i className="bi bi-floppy-fill"></i>
                          <span>{editingProfileId ? 'Update Profile' : 'Save Profile'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: System Prompts Management */}
      {activeTab === 'system_prompts' && (
        <div className="row g-4">
          {/* Left Column: System Prompts List */}
          <div className="col-lg-5">
            <div className="card-modern p-4 shadow-sm flex-grow-1">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                  <i className="bi bi-chat-square-quote-fill text-purple fs-5"></i>
                  <span>Configured System Prompts</span>
                </h6>
                <span className="badge badge-purple fs-8">{systemPrompts.length}</span>
              </div>

              {loadingSystemPrompts ? (
                <div className="text-center py-4">
                  <div className="spinner-border spinner-border-sm text-purple" role="status"></div>
                  <small className="text-muted d-block mt-2">Loading system prompts...</small>
                </div>
              ) : systemPrompts.length === 0 ? (
                <div className="p-3 text-center text-muted bg-light rounded-3 fs-8">
                  No system prompts created yet. Click "Create New System Prompt" to add one.
                </div>
              ) : (
                <div className="d-flex flex-column gap-2 overflow-auto" style={{ maxHeight: '520px' }}>
                  {systemPrompts.map((sp) => (
                    <div
                      key={sp.id}
                      onClick={() => handleEditPrompt(sp)}
                      className={`p-3 rounded-3 cursor-pointer border transition ${
                        editingPromptId === sp.id
                          ? 'bg-purple-subtle border-purple text-purple fw-semibold shadow-sm'
                          : 'bg-white border-light hover-bg-light text-dark'
                      }`}
                    >
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <span className="fs-7 fw-bold d-block text-truncate" style={{ maxWidth: '220px' }}>
                            {sp.name}
                          </span>
                          {sp.is_default ? (
                            <span className="badge bg-success-subtle text-success border border-success-subtle fs-9 mt-1 me-2">
                              <i className="bi bi-check-circle-fill me-1"></i> Active Default
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetDefaultPrompt(sp.id);
                              }}
                              className="btn btn-xs btn-outline-purple fs-9 py-0 px-2 mt-1"
                              title="Set as active default system prompt"
                            >
                              Set Active Default
                            </button>
                          )}
                        </div>

                        <div className="d-flex align-items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePrompt(sp.id);
                            }}
                            className="btn btn-sm text-danger p-0 border-0 ms-1"
                            title="Delete System Prompt"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </div>

                      <p className="text-muted fs-8 text-truncate-2 mb-0" style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {sp.prompt_text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: System Prompt Editor Form */}
          <div className="col-lg-7">
            <div className="card-modern p-4 shadow-sm h-100 d-flex flex-column">
              <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                <div>
                  <h5 className="fw-bold text-dark mb-1">
                    {editingPromptId ? `Edit System Prompt (ID: ${editingPromptId})` : 'Create New System Prompt'}
                  </h5>
                  <p className="text-muted fs-7 mb-0">
                    Define system prompts that dictate the agent's persona, search rules, and operating behavior.
                  </p>
                </div>
              </div>

              {promptSaveSuccessMsg && (
                <div className="alert alert-success d-flex align-items-center gap-2 p-3 rounded-3 mb-3">
                  <i className="bi bi-check-circle-fill fs-5"></i>
                  <span>{promptSaveSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleSavePrompt} className="flex-grow-1 d-flex flex-column gap-3">
                <div>
                  <label className="fs-8 fw-bold text-muted mb-1 d-block">System Prompt Name:</label>
                  <input
                    type="text"
                    className="form-control fs-7 rounded-3 p-2.5"
                    placeholder="e.g. Senior Tech Recruiter Agent"
                    value={promptName}
                    onChange={(e) => setPromptName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-check form-switch my-1">
                  <input
                    className="form-check-input cursor-pointer"
                    type="checkbox"
                    role="switch"
                    id="promptDefaultSwitch"
                    checked={promptIsDefault}
                    onChange={(e) => setPromptIsDefault(e.target.checked)}
                  />
                  <label className="form-check-input-label fs-8 fw-semibold text-dark ms-2 cursor-pointer" htmlFor="promptDefaultSwitch">
                    Set as Active Default System Prompt for all new chat conversations
                  </label>
                </div>

                <div className="flex-grow-1 d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label className="fs-8 fw-bold text-muted mb-0">
                      System Prompt Instructions:
                    </label>
                    <div className="d-flex align-items-center gap-2">
                      <span className="badge bg-light text-secondary font-monospace fs-9 border">
                        {promptText.length} chars
                      </span>
                      <span className="badge bg-purple-subtle text-purple font-monospace fs-9 border border-purple-subtle fw-bold">
                        <i className="bi bi-cpu-fill me-1"></i>
                        {promptText.length === 0 ? 0 : Math.ceil(promptText.length / 3)} tokens (3 chars/token)
                      </span>
                    </div>
                  </div>
                  <textarea
                    className="form-control font-monospace fs-8 p-3 flex-grow-1 rounded-3 bg-dark text-light border-secondary"
                    style={{ minHeight: '340px', tabSize: 2, lineHeight: 1.5 }}
                    placeholder="Enter system prompt text..."
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    required
                  />
                </div>

                <div className="pt-3 border-top d-flex justify-content-between align-items-center">
                  <small className="text-muted fs-8">
                    <i className="bi bi-info-circle me-1"></i> Active default prompt applies automatically unless chosen otherwise when creating a session.
                  </small>

                  <div className="d-flex gap-2">
                    {editingPromptId && (
                      <button
                        type="button"
                        onClick={handleStartNewPrompt}
                        className="btn btn-outline-secondary btn-sm"
                      >
                        Cancel Edit
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingPrompt}
                      className="btn btn-purple px-4 fw-bold rounded-3 d-flex align-items-center gap-2"
                    >
                      {savingPrompt ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status"></span>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <i className="bi bi-floppy-fill"></i>
                          <span>{editingPromptId ? 'Update Prompt' : 'Save System Prompt'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
