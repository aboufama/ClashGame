// Legacy compatibility wrapper for Blob storage.
import { createBlobStorage } from './_lib/storage/blob.js';
import { hashPassword, verifyPassword } from './_lib/passwords.js';

export const BlobStorage = createBlobStorage();
export { hashPassword, verifyPassword };
