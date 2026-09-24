import React, { useState } from 'react';

interface AuthPageProps {
  onLoginSuccess: (user: any, token: string) => void;
  API_BASE_URL: string;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLoginSuccess, API_BASE_URL }) => {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setNotification({ msg: 'Please fill in all login fields.', type: 'danger' });
      return;
    }

    const demoUser = {
      id: 101,
      name: loginEmail.split('@')[0] || 'Candidate',
      email: loginEmail,
      created_at: new Date().toISOString()
    };
    const demoToken = `token_${Date.now()}`;
    localStorage.setItem('access_token', demoToken);
    localStorage.setItem('user_profile', JSON.stringify(demoUser));

    onLoginSuccess(demoUser, demoToken);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword || !regConfirmPassword) {
      setNotification({ msg: 'Please complete all registration fields.', type: 'danger' });
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setNotification({ msg: 'Passwords do not match.', type: 'danger' });
      return;
    }

    const newUser = {
      id: Date.now(),
      name: regName,
      email: regEmail,
      created_at: new Date().toISOString()
    };
    const newToken = `token_${Date.now()}`;
    localStorage.setItem('access_token', newToken);
    localStorage.setItem('user_profile', JSON.stringify(newUser));

    setNotification({ msg: 'Registration successful! Signing you in...', type: 'success' });
    setTimeout(() => {
      onLoginSuccess(newUser, newToken);
    }, 800);
  };

  return (
    <div className="auth-wrapper d-flex align-items-center justify-content-center min-vh-100 bg-light p-3">
      <div className="card-modern shadow-lg p-4 p-md-5" style={{ maxWidth: '460px', width: '100%' }}>
        {/* Brand Header */}
        <div className="text-center mb-4">
          <div className="avatar-purple rounded-circle mx-auto mb-3 d-flex align-items-center justify-content-center shadow-sm" style={{ width: 64, height: 64 }}>
            <i className="bi bi-robot text-purple display-6"></i>
          </div>
          <h3 className="fw-bold text-dark mb-1">JobAgent AI</h3>
          <p className="text-muted fs-7">LinkedIn Job Search & ATS Modification Platform</p>
        </div>

        {notification && (
          <div className={`alert alert-${notification.type} alert-dismissible fade show border-0 shadow-sm mb-4`} role="alert">
            {notification.msg}
            <button type="button" className="btn-close" onClick={() => setNotification(null)}></button>
          </div>
        )}

        {/* Tab Toggle */}
        <div className="d-flex rounded-3 bg-light p-1 mb-4 border">
          <button
            onClick={() => setAuthTab('login')}
            className={`btn flex-grow-1 py-2 fw-bold transition-all ${authTab === 'login' ? 'btn-purple shadow-sm' : 'text-muted'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => setAuthTab('register')}
            className={`btn flex-grow-1 py-2 fw-bold transition-all ${authTab === 'register' ? 'btn-purple shadow-sm' : 'text-muted'}`}
          >
            Create Account
          </button>
        </div>

        {authTab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label text-dark font-weight-semibold fs-7 mb-1">Email Address</label>
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0"><i className="bi bi-envelope text-muted"></i></span>
                <input
                  type="email"
                  className="form-control border-start-0"
                  placeholder="candidate@company.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="form-label text-dark font-weight-semibold fs-7 mb-1">Password</label>
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0"><i className="bi bi-lock text-muted"></i></span>
                <input
                  type="password"
                  className="form-control border-start-0"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-purple w-100 py-2.5 fw-bold shadow-sm mt-2">
              Sign In to JobAgent
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label text-dark font-weight-semibold fs-7 mb-1">Full Name</label>
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0"><i className="bi bi-person text-muted"></i></span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="John Doe"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="form-label text-dark font-weight-semibold fs-7 mb-1">Email Address</label>
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0"><i className="bi bi-envelope text-muted"></i></span>
                <input
                  type="email"
                  className="form-control border-start-0"
                  placeholder="john@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="form-label text-dark font-weight-semibold fs-7 mb-1">Password</label>
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0"><i className="bi bi-lock text-muted"></i></span>
                <input
                  type="password"
                  className="form-control border-start-0"
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="form-label text-dark font-weight-semibold fs-7 mb-1">Confirm Password</label>
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0"><i className="bi bi-shield-check text-muted"></i></span>
                <input
                  type="password"
                  className="form-control border-start-0"
                  placeholder="••••••••"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-purple w-100 py-2.5 fw-bold shadow-sm mt-2">
              Create Candidate Account
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
