
import React, { useState } from 'react';
import { Auth } from '../game/backend/AuthService';
import './Login.css';

interface LoginProps {
    onLogin: (user: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) return;

        setLoading(true);
        setError(null);

        try {
            let profile;
            if (isRegistering) {
                profile = await Auth.register(username, password, email || undefined);
            } else {
                profile = await Auth.login(username, password);
            }
            onLogin(profile);
        } catch (err: any) {
            setError(err.message || "Authentication failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-overlay">
            <div className="login-card">
                <div className="login-header">
                    <div className="logo-container">
                        <div className="logo-icon">⚔️</div>
                    </div>
                    <h1>GRAND LANE</h1>
                    <p className="subtitle">THE ULTIMATE ISOMETRIC WARFARE</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="input-group">
                        <label>VILLAGE NAME</label>
                        <input
                            type="text"
                            placeholder="Commander Name..."
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <div className="label-row">
                            <label>KEY PHRASE</label>
                            {!isRegistering && <span className="forgot-hint" onClick={() => alert("Password recovery will be available once the remote backend is integrated. For now, check your local vault.")}>Forgot?</span>}
                        </div>
                        <input
                            type="password"
                            placeholder="Password..."
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {isRegistering && (
                        <div className="input-group animated-fade-in">
                            <label>RECOVERY EMAIL (OPTIONAL)</label>
                            <input
                                type="email"
                                placeholder="commander@grandlane.io"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    )}

                    {error && <div className="login-error">{error}</div>}

                    <button type="submit" className={`login-submit ${loading ? 'loading' : ''}`} disabled={loading}>
                        {loading ? (
                            <div className="spinner"></div>
                        ) : (
                            isRegistering ? 'ESTABLISH VILLAGE' : 'COMMAND VILLAGE'
                        )}
                    </button>
                </form>

                <div className="login-footer">
                    <button onClick={() => { setIsRegistering(!isRegistering); setError(null); }}>
                        {isRegistering ? 'RETURNING COMMANDER? LOGIN' : 'NEW TERRITORY? REGISTER'}
                    </button>
                </div>

                <div className="login-bg-decoration">
                    <div className="cloud c1"></div>
                    <div className="cloud c2"></div>
                    <div className="cloud c3"></div>
                </div>
            </div>

            <div className="login-disclaimer">
                <p>SECURE TERMINAL ACTIVE. LOCAL DATA PERSISTENCE ENABLED.</p>
            </div>
        </div>
    );
};
