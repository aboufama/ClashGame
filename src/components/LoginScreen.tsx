import { useState } from 'react';
import { Auth, type UserProfile } from '../game/backend/AuthService';

interface LoginScreenProps {
  onLogin: (user: UserProfile, cloudBase?: any) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        const result = await Auth.register(username, password);
        if (result.success && result.user) {
          onLogin(result.user);
        } else {
          setError(result.error || 'Registration failed');
        }
      } else {
        const result = await Auth.login(username, password);
        if (result.success && result.user) {
          onLogin(result.user, result.base);
        } else {
          setError(result.error || 'Login failed');
        }
      }
    } catch (err) {
      setError('Network error. Try offline mode.');
    } finally {
      setLoading(false);
    }
  };

  const handleOffline = () => {
    const user = Auth.playOffline();
    onLogin(user);
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-header">
          <h1>CLASH ISO</h1>
          <p className="subtitle">Defend your village. Raid your enemies.</p>
        </div>

        <div className="login-tabs">
          <button
            className={`tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            LOGIN
          </button>
          <button
            className={`tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            REGISTER
          </button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label>USERNAME</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              minLength={3}
              maxLength={20}
              required
              disabled={loading}
            />
          </div>

          <div className="input-group">
            <label>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              minLength={4}
              required
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'LOADING...' : mode === 'login' ? 'ENTER BATTLE' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <div className="divider">
          <span>OR</span>
        </div>

        <button className="offline-btn" onClick={handleOffline} disabled={loading}>
          PLAY OFFLINE
        </button>

        <p className="info-text">
          {mode === 'login'
            ? 'Login to sync your base across devices and attack other players!'
            : 'Create an account to save your progress to the cloud!'}
        </p>
      </div>
    </div>
  );
}
