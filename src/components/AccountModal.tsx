import { useEffect, useState } from 'react';

interface AccountModalProps {
  isOpen: boolean;
  currentUser: { id: string; username: string; deviceSecret?: string } | null;
  isOnline: boolean;
  onClose: () => void;
  onLogin: (playerId: string, deviceSecret: string) => Promise<void>;
  onRegister: (username: string, playerId?: string, deviceSecret?: string) => Promise<string>;
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
  const [loginId, setLoginId] = useState('');
  const [loginSecret, setLoginSecret] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerId, setRegisterId] = useState('');
  const [registerSecret, setRegisterSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setCreatedSecret(null);
    if (currentUser) {
      setMode('current');
    } else {
      setMode('login');
    }
  }, [isOpen, currentUser]);

  const copyText = (value?: string) => {
    if (!value) return;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value);
    }
  };

  const handleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      await onLogin(loginId.trim(), loginSecret.trim());
      setLoginId('');
      setLoginSecret('');
      setMode('current');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      setError(message.includes('Invalid credentials') ? 'Account exists. Use the correct secret or create a new account.' : message);
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    setBusy(true);
    setError(null);
    try {
      const secret = await onRegister(registerName.trim() || 'Commander', registerId.trim() || undefined, registerSecret.trim() || undefined);
      setCreatedSecret(secret);
      setRegisterName('');
      setRegisterId('');
      setRegisterSecret('');
      setMode('current');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed.';
      setError(message.includes('Invalid credentials') ? 'Account already exists. Use Login instead.' : message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setError(null);
    try {
      await onLogout();
      setMode('login');
    } catch {
      setError('Logout failed.');
    } finally {
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
            disabled={!currentUser}
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

        {mode === 'current' && currentUser && (
          <div className="account-panel">
            <div className="account-field">
              <span>ID</span>
              <div className="field-row">
                <code>{currentUser.id}</code>
                <button className="copy-btn" onClick={() => copyText(currentUser.id)}>COPY</button>
              </div>
            </div>
            <div className="account-field">
              <span>USERNAME</span>
              <div className="field-row">
                <code>{currentUser.username}</code>
              </div>
            </div>
            <div className="account-field">
              <span>SECRET</span>
              <div className="field-row">
                <code>{currentUser.deviceSecret ?? '***'}</code>
                <button className="copy-btn" onClick={() => copyText(currentUser.deviceSecret)}>COPY</button>
              </div>
            </div>
            {createdSecret && (
              <div className="account-warning">
                Save your secret: <code>{createdSecret}</code>
              </div>
            )}
            <button className="logout-btn" onClick={handleLogout} disabled={busy}>
              LOG OUT
            </button>
          </div>
        )}

        {mode === 'login' && (
          <div className="account-panel">
            <label>
              PLAYER ID
              <input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="p_xxxxxx"
              />
            </label>
            <label>
              SECRET
              <input
                value={loginSecret}
                onChange={(e) => setLoginSecret(e.target.value)}
                placeholder="your secret"
                type="password"
              />
            </label>
            <button className="action-btn" onClick={handleLogin} disabled={busy || !loginId || !loginSecret}>
              LOG IN
            </button>
          </div>
        )}

        {mode === 'register' && (
          <div className="account-panel">
            <label>
              USERNAME
              <input
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="Commander"
              />
            </label>
            <label>
              PLAYER ID (optional)
              <input
                value={registerId}
                onChange={(e) => setRegisterId(e.target.value)}
                placeholder="leave blank for auto"
              />
            </label>
            <label>
              SECRET (optional)
              <input
                value={registerSecret}
                onChange={(e) => setRegisterSecret(e.target.value)}
                placeholder="auto-generated if blank"
              />
            </label>
            <button className="action-btn" onClick={handleRegister} disabled={busy}>
              CREATE ACCOUNT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
