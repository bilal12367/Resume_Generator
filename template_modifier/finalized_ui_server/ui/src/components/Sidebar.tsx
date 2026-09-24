import React from 'react';



interface SidebarProps {
  activePage: string;
  onNavigate: (page: NavPage) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, onNavigate, onLogout }) => {
  const navItems: { id: NavPage; label: string; icon: string; badge?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'bi-grid-1x2-fill' },
    { id: 'jobs', label: 'Applied Jobs', icon: 'bi-briefcase-fill' },
    { id: 'saved-jobs', label: 'Saved Jobs', icon: 'bi-bookmark-star-fill' },
    { id: 'chat', label: 'Agent Chat', icon: 'bi-chat-dots-fill', badge: 'AI' },
    { id: 'workflow', label: 'ATS Workflow', icon: 'bi-magic', badge: 'PRO' },
    { id: 'analytics', label: 'Analytics', icon: 'bi-bar-chart-line-fill' },
    { id: 'profile', label: 'Profile', icon: 'bi-person-fill-gear' },
  ];

  const activeIndex = navItems.findIndex(i => i.id === activePage);
  // Item height (44px) + gap (6.4px) = 50.4px
  const indicatorOffset = activeIndex >= 0 ? activeIndex * 50.4 : 0;

  return (
    <aside className="sidebar-container">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">
          <i className="bi bi-robot fs-4"></i>
        </div>
        <div className="sidebar-brand-text">
          <h6 className="fw-bold text-dark mb-0 leading-tight">JobAgent AI</h6>
          <small className="text-muted fs-8">LinkedIn ATS Platform</small>
        </div>
      </div>

      {/* Navigation Menu with Floating Active Indicator */}
      <div className="sidebar-menu">
        {activeIndex >= 0 && (
          <div
            className="sidebar-active-indicator"
            style={{ transform: `translateY(${indicatorOffset}px)` }}
          />
        )}

        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <div
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
            >
              <i className={`bi ${item.icon} sidebar-icon`}></i>
              <span className="sidebar-label">{item.label}</span>
              {item.badge && (
                <span className={`badge ${isActive ? 'bg-white text-purple' : 'badge-purple'} ms-auto fs-8`}>
                  {item.badge}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* User Footer / Logout */}
      <div className="sidebar-footer p-3 border-top">
        <div onClick={onLogout} className="sidebar-item text-danger hover-bg-light cursor-pointer w-100">
          <i className="bi bi-box-arrow-right sidebar-icon text-danger"></i>
          <span className="sidebar-label text-danger">Sign Out</span>
        </div>
      </div>
    </aside>
  );
};

export type NavPage = 'dashboard' | 'jobs' | 'saved-jobs' | 'chat' | 'workflow' | 'analytics' | 'profile';