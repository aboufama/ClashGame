
const API_BASE = '/api';

export interface UserProfile {
    id: string;
    username: string;
    email?: string;
    lastLogin: number;
}

export class AuthService {
    private static instance: AuthService;
    private currentUser: UserProfile | null = null;
    private readonly SESSION_KEY = 'clashIso_session';

    constructor() {
        if (AuthService.instance) return AuthService.instance;
        AuthService.instance = this;
        this.loadSession();
    }

    private loadSession() {
        const saved = localStorage.getItem(this.SESSION_KEY);
        if (saved) {
            try {
                this.currentUser = JSON.parse(saved);
            } catch (e) {
                console.error("Failed to load session", e);
            }
        }
    }

    public async login(username: string, password: string): Promise<UserProfile> {
        const res = await fetch(`${API_BASE}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username, password }) // Password sent to API over HTTPS
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Login failed');
        }

        const user: UserProfile = await res.json();

        // Update local state
        this.currentUser = user;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
        return user;
    }

    public async register(username: string, password: string): Promise<UserProfile> {
        const res = await fetch(`${API_BASE}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register', username, password })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Registration failed');
        }

        const user: UserProfile = await res.json();

        this.currentUser = user;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
        return user;
    }

    public async deleteAccount(userId: string): Promise<void> {
        // For now, just logout locally. In a real app, delete from DB.
        // Or implement the API if critical.
        if (userId === this.currentUser?.id) {
            this.logout();
        }
    }

    public logout() {
        this.currentUser = null;
        localStorage.removeItem(this.SESSION_KEY);
    }

    public getCurrentUser(): UserProfile | null {
        return this.currentUser;
    }

    public isLoggedIn(): boolean {
        return !!this.currentUser;
    }
}

export const Auth = new AuthService();
