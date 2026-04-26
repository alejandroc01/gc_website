import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  clearStoredAdminAuthToken,
  getCurrentAdmin,
  getStoredAdminAuthToken,
  loginAdmin,
} from '../../api/composites.js';
import '../../styles/composites.css';
import './AdminAuthGate.css';

const AdminSessionContext = createContext({
  admin: null,
  setAdmin: () => {},
  logout: () => {},
});

export function useAdminSession() {
  return useContext(AdminSessionContext);
}

export default function AdminAuthGate({ children }) {
  const [admin, setAdmin] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [loginValues, setLoginValues] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadAdminSession = async () => {
      if (!getStoredAdminAuthToken()) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const payload = await getCurrentAdmin();

        if (isActive) {
          setAdmin(payload.admin);
        }
      } catch {
        clearStoredAdminAuthToken();
      } finally {
        if (isActive) {
          setIsCheckingSession(false);
        }
      }
    };

    loadAdminSession();

    return () => {
      isActive = false;
    };
  }, []);

  const handleLoginFieldChange = (event) => {
    const { name, value } = event.target;

    setLoginValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setLoginError('');
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setIsSigningIn(true);
    setLoginError('');

    try {
      const payload = await loginAdmin(loginValues);
      setAdmin(payload.admin);
      setLoginValues({ username: '', password: '' });
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogout = () => {
    clearStoredAdminAuthToken();
    setAdmin(null);
  };

  const sessionValue = useMemo(() => ({
    admin,
    setAdmin,
    logout: handleLogout,
  }), [admin]);

  if (isCheckingSession) {
    return (
      <section className="section adminAuthPage">
        <div className="adminAuthDialog" role="status" aria-live="polite">
          <h1 className="adminAuthDialog__title">Admin Tools</h1>
          <p className="adminAuthDialog__copy">Checking admin session...</p>
        </div>
      </section>
    );
  }

  if (!admin) {
    return (
      <section className="section adminAuthPage">
        <form className="adminAuthDialog" role="dialog" aria-modal="true" onSubmit={handleLoginSubmit}>
          <p className="adminAuthDialog__eyebrow">Restricted Access</p>
          <h1 className="adminAuthDialog__title">Admin Tools</h1>

          <label className="adminAuthDialog__field">
            <span>Username</span>
            <input
              name="username"
              type="text"
              autoComplete="username"
              value={loginValues.username}
              onChange={handleLoginFieldChange}
            />
          </label>

          <label className="adminAuthDialog__field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={loginValues.password}
              onChange={handleLoginFieldChange}
            />
          </label>

          <button className="button compositeButton compositeButton--filled" type="submit" disabled={isSigningIn}>
            {isSigningIn ? 'Signing In...' : 'Sign In'}
          </button>

          {loginError ? <p className="adminAuthDialog__error">{loginError}</p> : null}
        </form>
      </section>
    );
  }

  return (
    <AdminSessionContext.Provider value={sessionValue}>
      <div className="adminSessionBar">
        <div className="container adminSessionBar__inner">
          <span>
            Signed in as <strong>{admin.username}</strong> ({admin.role})
          </span>
          <button type="button" className="adminSessionBar__button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>
      {children}
    </AdminSessionContext.Provider>
  );
}
