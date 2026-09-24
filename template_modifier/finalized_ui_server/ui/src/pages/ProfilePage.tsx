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

export const ProfilePage: React.FC<ProfilePageProps> = ({ user, onUpdateUser, API_BASE_URL }) => {
  // Account Info State
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [savedAccount, setSavedAccount] = useState(false);

  // Resume Profiles State
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState<boolean>(true);

  // Form State
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [userDataText, setUserDataText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

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

  useEffect(() => {
    fetchProfiles();
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
        // Update existing profile
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
        // Create new profile
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

  return (
    <div className="p-4 d-flex flex-column gap-4 maxWidth-xl mx-auto" style={{ maxWidth: '1100px' }}>
      {/* Page Header */}
      <div className="card-modern p-4 bg-purple-gradient text-white border-0 shadow-sm">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <h4 className="fw-bold mb-1">
              <i className="bi bi-person-lines-fill me-2"></i> User & Resume Profiles Management
            </h4>
            <p className="mb-0 text-white-50 fs-7">
              Manage candidate profiles with JSON/text data fed directly into ATS optimization workflows.
            </p>
          </div>
          <button onClick={handleStartNewProfile} className="btn btn-light text-purple fw-bold shadow-sm d-flex align-items-center gap-2">
            <i className="bi bi-plus-lg"></i>
            <span>Create New Profile</span>
          </button>
        </div>
      </div>

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
    </div>
  );
};

export default ProfilePage;
