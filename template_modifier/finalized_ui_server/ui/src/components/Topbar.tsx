import React from 'react';
import type { User } from '../types';

interface TopbarProps {
  activePage: string;
  user: User;
  darkMode: boolean;
  toggleTheme: () => void;
  health: any;
}

export const Topbar: React.FC<TopbarProps> = ({ activePage, user, darkMode, toggleTheme, health }) => {
  const getPageTitle = (page: string) => {
    switch (page) {
      case 'dashboard': return 'Dashboard';
      case 'jobs': return 'Applied Jobs';
      case 'saved-jobs': return 'Browse Saved Jobs';
      case 'chat': return 'LinkedIn Agent Chat';
      case 'workflow': return 'ATS Resume Workflow';
      case 'analytics': return 'Token Analytics & Logs';
      case 'profile': return 'User Profile';
      default: return page.replace('-', ' ');
    }
  };

  return (
    <header className="topbar-header d-flex justify-content-between align-items-center">
      <div className="d-flex align-items-center gap-3">
        <h4 className="fw-bold text-dark mb-0 text-capitalize">{getPageTitle(activePage)}</h4>
        <span className="badge badge-purple">{user.email}</span>
      </div>

      <div className="d-flex align-items-center gap-3">
        <button onClick={toggleTheme} className="theme-toggle-btn" title="Toggle Dark/Light Mode">
          <i className={`bi ${darkMode ? 'bi-sun-fill text-warning' : 'bi-moon-stars-fill text-purple'}`}></i>
        </button>

        {health?.database === 'connected' ? (
          <span className="badge badge-success-subtle d-flex align-items-center gap-2">
            <span className="bg-success rounded-circle" style={{ width: '8px', height: '8px' }}></span>
            MySQL Connected
          </span>
        ) : (
          <span className="badge badge-danger-subtle d-flex align-items-center gap-2">
            <span className="bg-danger rounded-circle" style={{ width: '8px', height: '8px' }}></span>
            MySQL Offline
          </span>
        )}

        <div className="d-flex align-items-center gap-2">
          <div className="avatar-circle">
            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="d-none d-md-block text-start">
            <div className="fw-bold text-dark fs-7 leading-tight">{user.name}</div>
            <div className="text-muted fs-8">Candidate</div>
          </div>
        </div>
      </div>
    </header>
  );
};
