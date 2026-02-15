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

type Mode = 'login' | 'register';
const EMAIL_LIKE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAccountMissingError(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes('no account found') ||
    normalized.includes('account not found') ||
    normalized.includes('user not found') ||
    normalized.includes('unknown user') ||
    normalized.includes('request failed: 404') ||
    normalized.includes('404')
  );
}

export function AccountModal({
  isOpen,
  currentUser,
  isOnline,
  onClose,
  onLogin,
  onRegister,
  onLogout
}: AccountModalProps) {
  const [mode, setMode] = useState<Mode>('login');
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
    setMode('login');
  }, [isOpen, currentUser, isOnline]);

  const handleLogin = async () => {
    if (submitLockRef.current || busy) return;
    const identifier = loginIdentifier.trim();
    if (!identifier || !loginPassword) {
      setError('Enter your email/username and password.');
      return;
    }

    submitLockRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onLogin(identifier, loginPassword);
      setLoginIdentifier('');
      setLoginPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      if (EMAIL_LIKE_PATTERN.test(identifier) && isAccountMissingError(message)) {
        const localPart = identifier.split('@')[0]?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 18) ?? '';
        setRegisterEmail(identifier);
        if (!registerName.trim() && localPart.length >= 3) {
          setRegisterName(localPart);
        }
        setRegisterPassword('');
        setRegisterConfirmPassword('');
        setMode('register');
        setError('No account found for that email. Create your account below.');
      } else {
        setError(message);
      }
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
      setMode('login');
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
          {currentUser && isOnline && (
            <span className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
              ONLINE AS {currentUser.username.toUpperCase()}
            </span>
          )}
          {currentUser && isOnline && (
            <button className="logout-btn" onClick={handleLogout} disabled={busy}>
              LOG OUT
            </button>
          )}
          <button className="account-close" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="account-tabs">
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

        {mode === 'login' && (
          <form
            className="account-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void handleLogin();
            }}
          >
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
            <button className="action-btn" type="submit" disabled={busy || !loginIdentifier.trim() || !loginPassword}>
              LOG IN
            </button>
          </form>
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
