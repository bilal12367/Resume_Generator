import { useState, useEffect } from 'react';
import type { User, JobApplication } from './types';
import { Sidebar, type NavPage } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { JobModal } from './components/JobModal';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { JobsPage } from './pages/JobsPage';
import { SavedJobsPage } from './pages/SavedJobsPage';
import { ChatPage } from './pages/ChatPage';
import { WorkflowPage } from './pages/WorkflowPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ProfilePage } from './pages/ProfilePage';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

export function App() {
  // Authentication State
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback default
      }
    }
    return {
      id: 1,
      name: 'Candidate Demo',
      email: 'candidate@example.com',
      created_at: new Date().toISOString(),
    };
  });

  // Routing State derived from Hash
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [activeSessionId, setActiveSessionId] = useState<string>('job_agent_session_01');

  // Job Modal State
  const [showJobModal, setShowJobModal] = useState<boolean>(false);
  const [jobModalData, setJobModalData] = useState<any>(null);
  const [loadingJobModal, setLoadingJobModal] = useState<boolean>(false);
  const [targetWorkflowSessionId, setTargetWorkflowSessionId] = useState<string>('');

  // System Health State
  const [health, setHealth] = useState<{ database: string }>({ database: 'connected' });

  // Dark Mode Theme State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  // Jobs Collection State for Dashboard & Jobs Page
  const [jobs] = useState<JobApplication[]>([
    {
      id: 'JOB-101',
      title: 'Senior Python Developer',
      company: 'TechCorp Inc.',
      status: 'ATS Data Generated',
      dateDaysAgo: '1 day ago',
      description: 'Looking for a Senior Python Developer with FastAPI and AI agent experience.',
      atsScore: 88,
      matchedKeywords: ['Python', 'FastAPI', 'MySQL', 'Docker'],
      missingKeywords: ['Kubernetes', 'GraphQL']
    },
    {
      id: 'JOB-102',
      title: 'AI Agent Engineer',
      company: 'DataMind Automation',
      status: 'Basic Information',
      dateDaysAgo: '3 days ago',
      description: 'Join our agent team building intelligent autonomous workflow assistants.',
      atsScore: 92,
      matchedKeywords: ['LangChain', 'Python', 'WebSockets', 'Centrifugo'],
      missingKeywords: ['Pinecone']
    }
  ]);

  // Handle Theme Toggle
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Listen to Hash Changes for Navigation & Session Routing
  useEffect(() => {
    const parseHashRoute = () => {
      const hash = window.location.hash || '#/dashboard';
      if (hash.startsWith('#/chat')) {
        setActivePage('chat');
        const parts = hash.split('#/chat/');
        if (parts.length > 1 && parts[1]) {
          setActiveSessionId(parts[1]);
        } else {
          setActiveSessionId('job_agent_session_01');
        }
      } else if (hash === '#/jobs') {
        setActivePage('jobs');
      } else if (hash === '#/saved-jobs') {
        setActivePage('saved-jobs');
      } else if (hash === '#/workflow') {
        setActivePage('workflow');
      } else if (hash === '#/analytics') {
        setActivePage('analytics');
      } else if (hash === '#/profile') {
        setActivePage('profile');
      } else {
        setActivePage('dashboard');
      }
    };

    parseHashRoute();
    window.addEventListener('hashchange', parseHashRoute);
    return () => window.removeEventListener('hashchange', parseHashRoute);
  }, []);

  // Health Polling
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (res.ok) {
          const data = await res.json();
          setHealth({ database: data.database || 'connected' });
        }
      } catch (err) {
        setHealth({ database: 'disconnected' });
      }
    };
    checkHealth();
  }, []);

  // Handler for explicit navigation (updates Hash in URL)
  const handleNavigate = (page: NavPage, sessionId?: string) => {
    if (page === 'chat') {
      const targetSession = sessionId || activeSessionId || 'job_agent_session_01';
      window.location.hash = `#/chat/${targetSession}`;
    } else {
      window.location.hash = `#/${page}`;
    }
  };

  // Fetch & Open Job Details Modal
  const handleOpenJobModal = async (jobId: string) => {
    setShowJobModal(true);
    setLoadingJobModal(true);
    setJobModalData({ job_id: jobId, title: `Loading Job ${jobId}...` });

    try {
      const res = await fetch(`${API_BASE_URL}/api/linkedin/jobs/details/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setJobModalData(data.job || data);
      } else {
        setJobModalData({ job_id: jobId, title: `Job ${jobId}`, description: 'Details cached in database.' });
      }
    } catch (err) {
      setJobModalData({ job_id: jobId, title: `Job ${jobId}`, description: 'Failed to connect to backend job cache.' });
    } finally {
      setLoadingJobModal(false);
    }
  };

  const handleStartWorkflowForJob = async (jobId: string) => {
    setShowJobModal(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workflow/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          title: `ATS Workflow (Job ${jobId})`
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTargetWorkflowSessionId(data.session_id);
      }
    } catch (err) {
      console.error("Failed to create workflow session for job:", err);
    } finally {
      window.location.hash = '#/workflow';
      setActivePage('workflow');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user_session');
    setUser(null);
  };

  const handleLogin = (loggedUser: User) => {
    localStorage.setItem('user_session', JSON.stringify(loggedUser));
    setUser(loggedUser);
  };

  // Render Auth Page if user not signed in
  if (!user) {
    return <AuthPage onLoginSuccess={(u) => handleLogin(u)} API_BASE_URL={API_BASE_URL} />;
  }

  return (
    <div className="app-container d-flex" style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Sidebar Navigation Navbar */}
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />

      {/* Main Content Viewport Layout */}
      <div className="main-content-layout flex-grow-1 d-flex flex-column" style={{ minWidth: 0, height: '100vh', overflow: 'hidden' }}>
        {/* Topbar Header */}
        <Topbar
          activePage={activePage}
          user={user}
          darkMode={darkMode}
          toggleTheme={() => setDarkMode(!darkMode)}
          health={health}
        />

        {/* Page Content Viewport */}
        <main
          className="content-area flex-grow-1"
          style={{ minWidth: 0, overflow: activePage === 'chat' || activePage === 'workflow' ? 'hidden' : 'auto' }}
        >
          {activePage === 'dashboard' && (
            <DashboardPage
              jobsCachedCount={12}
              jobs={jobs}
              pdfsGeneratedCount={4}
              onNavigate={(p) => handleNavigate(p as NavPage)}
              onViewJob={handleOpenJobModal}
            />
          )}

          {activePage === 'jobs' && (
            <JobsPage
              jobs={jobs}
              onViewJob={handleOpenJobModal}
            />
          )}

          {activePage === 'saved-jobs' && (
            <SavedJobsPage
              API_BASE_URL={API_BASE_URL}
              onViewJob={handleOpenJobModal}
            />
          )}

          {activePage === 'chat' && (
            <ChatPage
              activeSessionId={activeSessionId}
              onSelectSession={(sessId) => handleNavigate('chat', sessId)}
              onOpenJobModal={handleOpenJobModal}
              API_BASE_URL={API_BASE_URL}
            />
          )}

          {activePage === 'workflow' && (
            <WorkflowPage
              API_BASE_URL={API_BASE_URL}
              onOpenJobModal={handleOpenJobModal}
              initialSessionId={targetWorkflowSessionId}
            />
          )}

          {activePage === 'analytics' && (
            <AnalyticsPage
              user={user}
              sessionCount={1}
              health={health}
            />
          )}

          {activePage === 'profile' && (
            <ProfilePage
              user={user}
              onUpdateUser={(updated) => setUser(prev => prev ? { ...prev, ...updated } : null)}
              API_BASE_URL={API_BASE_URL}
            />
          )}
        </main>
      </div>

      {/* Reusable Job Metadata & Description Modal */}
      <JobModal
        show={showJobModal}
        jobData={jobModalData}
        loading={loadingJobModal}
        onClose={() => setShowJobModal(false)}
        onStartWorkflow={handleStartWorkflowForJob}
      />
    </div>
  );
}

export default App;
