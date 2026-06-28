/**
 * Password hashing using PBKDF2-SHA256 via Web Crypto API.
 *
 * Stored format: `pbkdf2$<iterations>$<base64-salt>$<base64-hash>`
 *
 * THREAT MODEL: This still runs in the browser, so a sophisticated attacker
 * with localStorage access can brute-force weak passwords offline. Use a
 * real backend (argon2id / bcrypt) in production. This is much better than
 * the prior FNV-1a demo, which had no salt and trivial reversibility.
 */

const ITERATIONS = 600_000 // OWASP 2023 minimum for PBKDF2-HMAC-SHA256
const SALT_BYTES = 16
const HASH_BYTES = 32

const enc = new TextEncoder()

/* ---------- base64 helpers (URL-safe not required — standard b64) ---------- */

function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/* ---------- core ---------- */

/**
 * Derive a key from `password` and `salt`.
 * Both `password` and `salt` must be passed as `ArrayBuffer` (not
 * `Uint8Array`) so the strict `BufferSource` types accepted by Web Crypto
 * are satisfied without casts.
 */
async function deriveBits(
  password: ArrayBuffer,
  salt: ArrayBuffer,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    password,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    HASH_BYTES * 8,
  )
  return new Uint8Array(bits)
}

function passwordToBuffer(plain: string): ArrayBuffer {
  const src = enc.encode(plain)
  const buf = new ArrayBuffer(src.byteLength)
  new Uint8Array(buf).set(src)
  return buf
}

export async function hashPassword(plain: string): Promise<string> {
  const saltBuf = new ArrayBuffer(SALT_BYTES)
  crypto.getRandomValues(new Uint8Array(saltBuf))
  const saltView = new Uint8Array(saltBuf) // for serialization only
  const passBuf = passwordToBuffer(plain)
  const hash = await deriveBits(passBuf, saltBuf, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${bytesToB64(saltView)}$${bytesToB64(hash)}`
}

export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
    const iterations = Number(parts[1])
    if (!Number.isFinite(iterations) || iterations < 1) return false
    // Decode salt into a fresh buffer-backed Uint8Array, then peel off the
    // `ArrayBuffer` so deriveBits gets the strict type it expects.
    const decoded = b64ToBytes(parts[2])
    const saltBuf = new ArrayBuffer(decoded.byteLength)
    new Uint8Array(saltBuf).set(decoded)
    const expected = b64ToBytes(parts[3])
    const passBuf = passwordToBuffer(plain)
    const got = await deriveBits(passBuf, saltBuf, iterations)
    return timingSafeEqual(got, expected)
  } catch {
    return false
  }
}

