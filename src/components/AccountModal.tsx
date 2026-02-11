import { useEffect, useRef, useState } from 'react';

interface AccountModalProps {
  isOpen: boolean;
  currentUser: { id: string; email: string; username: string } | null;
  isOnline: boolean;
  onClose: () => void;
  onLogin: (identifier: string, password: string) => Promise<void>;
  onRegister: (email: string, username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

type Mode = 'current' | 'login' | 'register';

export function AccountModal({
  isOpen,
  currentUser,
  isOnline,
  onClose,
  onLogin,
  onRegister,
  onLogout
}: AccountModalProps) {
  const [mode, setMode] = useState<Mode>('current');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (currentUser && isOnline) {
      setMode('current');
    } else {
      setMode('login');
    }
  }, [isOpen, currentUser, isOnline]);

  const copyText = (value?: string) => {
    if (!value) return;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value);
    }
  };

  const handleLogin = async () => {
    if (submitLockRef.current || busy) return;
    submitLockRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onLogin(loginIdentifier.trim(), loginPassword);
      setLoginIdentifier('');
      setLoginPassword('');
      setMode('current');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      setError(message);
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    if (submitLockRef.current || busy) return;
    if (registerPassword !== registerConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    submitLockRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onRegister(registerEmail.trim(), registerName.trim(), registerPassword);
      setRegisterEmail('');
      setRegisterName('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
      setMode('current');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed.';
      setError(message);
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (submitLockRef.current || busy) return;
    submitLockRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onLogout();
      setMode('login');
    } catch {
      setError('Logout failed.');
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="account-modal-backdrop">
      <div className="account-modal">
        <div className="account-modal-header">
          <h3>ACCOUNT</h3>
          {currentUser && (
            <span className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          )}
          <button className="account-close" onClick={onClose}>✕</button>
        </div>

        <div className="account-tabs">
          <button
            className={`tab-btn ${mode === 'current' ? 'active' : ''}`}
            disabled={!currentUser || !isOnline}
            onClick={() => setMode('current')}
          >
            CURRENT
          </button>
          <button
            className={`tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            LOGIN
          </button>
          <button
            className={`tab-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            CREATE
          </button>
        </div>

        {error && <div className="account-error">{error}</div>}
        {busy && !error && <div className="account-warning">Please wait...</div>}

        {mode === 'current' && currentUser && isOnline && (
          <div className="account-panel">
            <div className="account-field">
              <span>ID</span>
              <div className="field-row">
                <code>{currentUser.id}</code>
                <button className="copy-btn" onClick={() => copyText(currentUser.id)}>COPY</button>
              </div>
            </div>
            <div className="account-field">
              <span>EMAIL</span>
              <div className="field-row">
                <code>{currentUser.email}</code>
                <button className="copy-btn" onClick={() => copyText(currentUser.email)}>COPY</button>
              </div>
            </div>
            <div className="account-field">
              <span>USERNAME</span>
              <div className="field-row">
                <code>{currentUser.username}</code>
                <button className="copy-btn" onClick={() => copyText(currentUser.username)}>COPY</button>
              </div>
            </div>
            <button className="logout-btn" onClick={handleLogout} disabled={busy}>
              LOG OUT
            </button>
          </div>
        )}

        {mode === 'login' && (
          <div className="account-panel">
            <label>
              EMAIL OR USERNAME
              <input
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="email@example.com or Commander01"
              />
            </label>
            <label>
              PASSWORD
              <input
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="your password"
                type="password"
              />
            </label>
            <button className="action-btn" onClick={handleLogin} disabled={busy || !loginIdentifier.trim() || !loginPassword}>
              LOG IN
            </button>
          </div>
        )}

        {mode === 'register' && (
          <div className="account-panel">
            <label>
              EMAIL
              <input
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="email@example.com"
                type="email"
              />
            </label>
            <label>
              USERNAME
              <input
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="Commander01"
              />
            </label>
            <label>
              PASSWORD
              <input
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="minimum 8 characters"
                type="password"
              />
            </label>
            <label>
              CONFIRM PASSWORD
              <input
                value={registerConfirmPassword}
                onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                placeholder="repeat password"
                type="password"
              />
            </label>
            <button
              className="action-btn"
              onClick={handleRegister}
              disabled={busy || !registerEmail.trim() || !registerName.trim() || !registerPassword || !registerConfirmPassword}
            >
              CREATE ACCOUNT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
