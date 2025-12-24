
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

    public getCurrentUser(): UserProfile | null {
        return this.currentUser;
    }

    // Auto-create default user for offline mode
    public static getOrCreateDefaultUser(): UserProfile {
        try {
            // Ensure instance exists
            const auth = AuthService.instance || new AuthService();
            const existing = auth.getCurrentUser();
            if (existing) {
                return existing;
            }

            // Create default user
            const defaultUser: UserProfile = {
                id: 'default_player',
                username: 'Player',
                lastLogin: Date.now()
            };

            auth.currentUser = defaultUser;
            localStorage.setItem(auth.SESSION_KEY, JSON.stringify(defaultUser));

            return defaultUser;
        } catch (error) {
            console.error('Error creating default user:', error);
            // Return a minimal user object even if localStorage fails
            return {
                id: 'default_player',
                username: 'Player',
                lastLogin: Date.now()
            };
        }
    }
}

export const Auth = new AuthService();
