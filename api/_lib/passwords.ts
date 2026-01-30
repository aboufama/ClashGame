import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

const LEGACY_PREFIX = 'legacy$';

function legacyHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i += 1) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }
  return hash.toString(16) + '_' + password.length;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

function verifyScrypt(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const [, n, r, p, salt, hash] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (!Number.isFinite(N) || !Number.isFinite(R) || !Number.isFinite(P)) return false;
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  });
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export function verifyPassword(password: string, stored: string): { valid: boolean; upgradedHash?: string } {
  if (stored.startsWith('scrypt$')) {
    return { valid: verifyScrypt(password, stored) };
  }

  if (stored.startsWith(LEGACY_PREFIX)) {
    const legacyStored = stored.slice(LEGACY_PREFIX.length);
    const valid = legacyHash(password) === legacyStored;
    return { valid, upgradedHash: valid ? hashPassword(password) : undefined };
  }

  const validLegacy = legacyHash(password) === stored;
  return { valid: validLegacy, upgradedHash: validLegacy ? hashPassword(password) : undefined };
}

export function wrapLegacyHash(password: string): string {
  return `${LEGACY_PREFIX}${legacyHash(password)}`;
}
