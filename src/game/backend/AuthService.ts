
export interface UserProfile {
    id: string;
    username: string;
    email?: string;
    lastLogin: number;
}

// API base URL - auto-detect based on environment
const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? ''  // Use relative URLs for local development with Vite proxy
    : ''; // Same for production (relative URLs work on Vercel)

export class AuthService {
    private static instance: AuthService;
    private currentUser: UserProfile | null = null;
    private readonly SESSION_KEY = 'clashIso_session';
    private isOnline: boolean = false;

    constructor() {
        if (AuthService.instance) return AuthService.instance;
        AuthService.instance = this;
        this.loadSession();
    }

    private loadSession() {
        try {
            const saved = localStorage.getItem(this.SESSION_KEY);
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    this.currentUser = data.user;
                    this.isOnline = data.isOnline || false;
                } catch (e) {
                    console.error("Failed to load session", e);
                    localStorage.removeItem(this.SESSION_KEY);
                }
            }
        } catch (e) {
            console.warn("Session storage unavailable", e);
        }
    }

    private saveSession() {
        try {
            if (this.currentUser) {
                localStorage.setItem(this.SESSION_KEY, JSON.stringify({
                    user: this.currentUser,
                    isOnline: this.isOnline
                }));
            } else {
                localStorage.removeItem(this.SESSION_KEY);
            }
        } catch (e) {
            console.warn("Failed to persist session", e);
        }
    }

    public getCurrentUser(): UserProfile | null {
        return this.currentUser;
    }

    public isOnlineMode(): boolean {
        return this.isOnline;
    }

    public setOnlineMode(online: boolean) {
        this.isOnline = online;
        this.saveSession();
    }

    // Register new user (online)
    public async register(username: string, password: string): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
        try {
            const response = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                const errorMsg = data.details
                    ? `${data.error}: ${data.details}`
                    : (data.error || 'Registration failed');
                return { success: false, error: errorMsg };
            }

            this.currentUser = data.user;
            this.isOnline = true;
            this.saveSession();

            return { success: true, user: data.user };
        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: 'Network error. Try offline mode.' };
        }
    }

    // Login existing user (online)
    public async login(username: string, password: string): Promise<{ success: boolean; error?: string; user?: UserProfile; base?: any }> {
        try {
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                return { success: false, error: data.error || 'Login failed' };
            }

            this.currentUser = data.user;
            this.isOnline = true;
            this.saveSession();

            return { success: true, user: data.user, base: data.base };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Network error. Try offline mode.' };
        }
    }

    // Logout
    public logout() {
        this.currentUser = null;
        this.isOnline = false;
        try {
            localStorage.removeItem(this.SESSION_KEY);
        } catch (e) {
            console.warn("Failed to clear session", e);
        }
    }

    // Delete account permanently
    public async deleteAccount(password: string): Promise<{ success: boolean; error?: string }> {
        if (!this.currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        // Offline users can just clear local data
        if (!this.isOnline || this.currentUser.id === 'offline_player') {
            this.logout();
            try {
                localStorage.clear();
            } catch (e) {
                console.warn("Failed to clear local storage", e);
            }
            return { success: true };
        }

        try {
            const response = await fetch(`${API_BASE}/api/auth/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: this.currentUser.id,
                    password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                return { success: false, error: data.error || 'Delete failed' };
            }

            // Clear local session
            this.logout();
            try {
                localStorage.clear();
            } catch (e) {
                console.warn("Failed to clear local storage", e);
            }

            return { success: true };
        } catch (error) {
            console.error('Delete account error:', error);
            return { success: false, error: 'Network error' };
        }
    }

    // Play offline (no account needed)
    public playOffline(): UserProfile {
        const offlineUser: UserProfile = {
            id: 'offline_player',
            username: 'Commander',
            lastLogin: Date.now()
        };
        this.currentUser = offlineUser;
        this.isOnline = false;
        this.saveSession();
        return offlineUser;
    }

    // Auto-create default user for offline mode (legacy support)
    public static getOrCreateDefaultUser(): UserProfile {
        try {
            const auth = AuthService.instance || new AuthService();
            const existing = auth.getCurrentUser();
            if (existing) {
                return existing;
            }

            // Create offline user by default
            return auth.playOffline();
        } catch (error) {
            console.error('Error creating default user:', error);
            return {
                id: 'offline_player',
                username: 'Commander',
                lastLogin: Date.now()
            };
        }
    }
}

export const Auth = new AuthService();
