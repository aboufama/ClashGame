
export interface UserProfile {
    id: string;
    username: string;
    email?: string;
    lastLogin: number;
}

interface UserRecord extends UserProfile {
    passwordHash: string; // Stored as plain text for this mock
}

export class AuthService {
    private static instance: AuthService;
    private currentUser: UserProfile | null = null;
    private readonly USERS_KEY = 'clashIso_users';
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

    private getUsers(): UserRecord[] {
        const saved = localStorage.getItem(this.USERS_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    private saveUsers(users: UserRecord[]) {
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    }

    public async login(username: string, password: string): Promise<UserProfile> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 800));

        const users = this.getUsers();
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.passwordHash === password);

        if (!user) {
            throw new Error("Invalid username or password");
        }

        const profile: UserProfile = {
            id: user.id,
            username: user.username,
            email: user.email,
            lastLogin: Date.now()
        };

        // Update last login in storage
        user.lastLogin = profile.lastLogin;
        this.saveUsers(users);

        this.currentUser = profile;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(profile));
        return profile;
    }

    public async register(username: string, password: string, email?: string): Promise<UserProfile> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        const users = this.getUsers();
        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            throw new Error("Username already exists");
        }

        const newUser: UserRecord = {
            id: crypto.randomUUID(),
            username,
            passwordHash: password,
            email: email || undefined,
            lastLogin: Date.now()
        };

        users.push(newUser);
        this.saveUsers(users);

        const profile: UserProfile = {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            lastLogin: newUser.lastLogin
        };

        this.currentUser = profile;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(profile));
        return profile;
    }

    public async deleteAccount(userId: string): Promise<void> {
        const users = this.getUsers().filter(u => u.id !== userId);
        this.saveUsers(users);
        this.logout();
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
