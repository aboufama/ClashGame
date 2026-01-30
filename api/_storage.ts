// Legacy compatibility wrapper for in-memory storage.
import { createMemoryStorage } from './_lib/storage/memory.js';
import { hashPassword, verifyPassword } from './_lib/passwords.js';

export const Storage = createMemoryStorage();
export { hashPassword, verifyPassword };
