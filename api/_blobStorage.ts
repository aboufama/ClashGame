// Vercel Blob Storage for persistent base data
import { put, del, list, type PutBlobResult } from '@vercel/blob';

interface User {
    id: string;
    username: string;
    passwordHash: string;
    createdAt: number;
    lastLogin: number;
}

interface StoredBase {
    id: string;
    ownerId: string;
    username: string;
    buildings: Array<{
        id: string;
        type: string;
        gridX: number;
        gridY: number;
        level: number;
    }>;
    obstacles?: Array<{
        id: string;
        type: string;
        gridX: number;
        gridY: number;
    }>;
    resources: { gold: number; elixir: number };
    army?: Record<string, number>;
    lastSaveTime: number;
}

interface AttackNotification {
    id: string;
    victimId: string;
    attackerId: string;
    attackerName: string;
    goldLost: number;
    elixirLost: number;
    destruction: number;
    timestamp: number;
    read: boolean;
}

// Helper to safely parse JSON from blob
async function fetchBlobJson<T>(url: string): Promise<T | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.json() as T;
    } catch {
        return null;
    }
}

// Find blob by pathname
async function findBlob(prefix: string): Promise<string | null> {
    try {
        const { blobs } = await list({ prefix });
        if (blobs.length > 0) {
            return blobs[0].url;
        }
        return null;
    } catch {
        return null;
    }
}

export const BlobStorage = {
    // ============ USER OPERATIONS ============

    async getUser(id: string): Promise<User | null> {
        const url = await findBlob(`users/${id}.json`);
        if (!url) return null;
        return fetchBlobJson<User>(url);
    },

    async getUserByUsername(username: string): Promise<User | null> {
        // List all users and find by username
        try {
            const { blobs } = await list({ prefix: 'users/' });
            for (const blob of blobs) {
                const user = await fetchBlobJson<User>(blob.url);
                if (user && user.username.toLowerCase() === username.toLowerCase()) {
                    return user;
                }
            }
            return null;
        } catch {
            return null;
        }
    },

    async createUser(user: User): Promise<void> {
        try {
            const result = await put(`users/${user.id}.json`, JSON.stringify(user), {
                access: 'public',
                addRandomSuffix: false,
                allowOverwrite: true,
            });
            console.log('User created successfully:', user.id, result.url);
        } catch (error) {
            console.error('Failed to create user in blob storage:', error);
            throw error; // Re-throw to propagate to API handler
        }
    },

    async updateUserLogin(id: string): Promise<void> {
        const user = await this.getUser(id);
        if (user) {
            user.lastLogin = Date.now();
            await put(`users/${id}.json`, JSON.stringify(user), {
                access: 'public',
                addRandomSuffix: false,
                allowOverwrite: true,
            });
        }
    },

    async deleteUser(userId: string): Promise<boolean> {
        try {
            // Delete user file
            const userUrl = await findBlob(`users/${userId}.json`);
            if (userUrl) await del(userUrl);

            // Delete base file
            const baseUrl = await findBlob(`bases/${userId}.json`);
            if (baseUrl) await del(baseUrl);

            // Delete notifications file
            const notifUrl = await findBlob(`notifications/${userId}.json`);
            if (notifUrl) await del(notifUrl);

            return true;
        } catch {
            return false;
        }
    },

    async getAllUsers(): Promise<Array<{ id: string; username: string }>> {
        try {
            const { blobs } = await list({ prefix: 'users/' });
            const users: Array<{ id: string; username: string }> = [];

            for (const blob of blobs) {
                const user = await fetchBlobJson<User>(blob.url);
                if (user) {
                    users.push({ id: user.id, username: user.username });
                }
            }

            return users;
        } catch {
            return [];
        }
    },

    // ============ BASE OPERATIONS ============

    async getBase(userId: string): Promise<StoredBase | null> {
        const url = await findBlob(`bases/${userId}.json`);
        if (!url) {
            console.log(`No base found in blob storage for user: ${userId}`);
            return null;
        }
        const base = await fetchBlobJson<StoredBase>(url);
        if (base) {
            console.log(`Base loaded from cloud for user: ${userId}`, {
                buildings: base.buildings.length,
                lastSave: new Date(base.lastSaveTime).toISOString()
            });
        }
        return base;
    },

    async saveBase(base: StoredBase): Promise<void> {
        try {
            const result = await put(`bases/${base.ownerId}.json`, JSON.stringify(base), {
                access: 'public',
                addRandomSuffix: false,
                allowOverwrite: true,
            });
            console.log(`Base saved to cloud for user: ${base.ownerId}`, {
                url: result.url,
                buildings: base.buildings.length,
                timestamp: new Date(base.lastSaveTime).toISOString()
            });
        } catch (error) {
            console.error('Failed to save base in blob storage:', error);
            throw error;
        }
    },

    async getOnlineBases(excludeUserId: string, limit: number = 10): Promise<StoredBase[]> {
        try {
            const { blobs } = await list({ prefix: 'bases/' });
            const bases: StoredBase[] = [];

            for (const blob of blobs) {
                if (bases.length >= limit) break;

                const base = await fetchBlobJson<StoredBase>(blob.url);
                if (base && base.ownerId !== excludeUserId && base.buildings.length > 0) {
                    // Filter out bases with only walls
                    const nonWallBuildings = base.buildings.filter(b => b.type !== 'wall');
                    if (nonWallBuildings.length > 0) {
                        bases.push(base);
                    }
                }
            }

            // Shuffle results
            return bases.sort(() => Math.random() - 0.5);
        } catch {
            return [];
        }
    },

    async getAllBases(): Promise<StoredBase[]> {
        try {
            const { blobs } = await list({ prefix: 'bases/' });
            const bases: StoredBase[] = [];

            for (const blob of blobs) {
                const base = await fetchBlobJson<StoredBase>(blob.url);
                if (base) {
                    bases.push(base);
                }
            }

            return bases;
        } catch {
            return [];
        }
    },

    // ============ NOTIFICATION OPERATIONS ============

    async addNotification(notification: AttackNotification): Promise<void> {
        const existing = await this.getNotifications(notification.victimId);
        existing.unshift(notification);
        // Keep only last 50 notifications
        if (existing.length > 50) existing.length = 50;

        await put(`notifications/${notification.victimId}.json`, JSON.stringify(existing), {
            access: 'public',
            addRandomSuffix: false,
            allowOverwrite: true,
        });
    },

    async getNotifications(userId: string): Promise<AttackNotification[]> {
        const url = await findBlob(`notifications/${userId}.json`);
        if (!url) return [];
        const notifications = await fetchBlobJson<AttackNotification[]>(url);
        return notifications || [];
    },

    async markNotificationsRead(userId: string): Promise<void> {
        const notifications = await this.getNotifications(userId);
        if (notifications.length > 0) {
            notifications.forEach((n: AttackNotification) => n.read = true);
            await put(`notifications/${userId}.json`, JSON.stringify(notifications), {
                access: 'public',
                addRandomSuffix: false,
                allowOverwrite: true,
            });
        }
    },

    async getUnreadCount(userId: string): Promise<number> {
        const notifications = await this.getNotifications(userId);
        return notifications.filter((n: AttackNotification) => !n.read).length;
    },

    // ============ RESOURCE OPERATIONS ============

    async deductResources(userId: string, gold: number, elixir: number): Promise<void> {
        const base = await this.getBase(userId);
        if (base) {
            base.resources.gold = Math.max(0, base.resources.gold - gold);
            base.resources.elixir = Math.max(0, base.resources.elixir - elixir);
            await this.saveBase(base);
        }
    },

    async wipeBases(): Promise<number> {
        try {
            const { blobs } = await list({ prefix: 'bases/' });
            if (blobs.length > 0) {
                const urls = blobs.map(b => b.url);
                await del(urls);
                return urls.length;
            }
            return 0;
        } catch (error) {
            console.error('Failed to wipe bases:', error);
            throw error;
        }
    }
};

// Simple hash function for passwords (in production, use bcrypt)
export function hashPassword(password: string): string {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(16) + '_' + password.length;
}

export function verifyPassword(password: string, hash: string): boolean {
    return hashPassword(password) === hash;
}
