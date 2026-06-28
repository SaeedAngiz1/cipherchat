/**
 * End-to-end encryption primitives, all built on Web Crypto (no extra deps).
 *
 *  Identity: each user holds an ECDH P-256 keypair. The public key is stored
 *            on the User record (plaintext). The private key never leaves the
 *            device — it's wrapped at rest with an AES-GCM key derived from
 *            the user's password (PBKDF2-SHA256, see crypto.ts).
 *
 *  DM key:   ECDH(myPriv, theirPub) → HKDF → AES-GCM key. Both parties derive
 *            the same 256-bit key without explicit key exchange.
 *
 *  Group:    Each group is born with a random 256-bit AES key. The key is
 *            stored once per member, encrypted with that member's
 *            AES-GCM key (derived from ECDH(groupAdmin.priv, member.pub)).
 *            On join, the admin re-wraps for the new member.
 *
 * This file only does cryptography. Persistence + lookup live in storage.ts.
 */

import { hashPassword as _hashPasswordForWrap, verifyPassword as _verifyPasswordForWrap } from './crypto'

const enc = new TextEncoder()

/* ---------- base64 helpers (duplicated locally to keep this file standalone) ---------- */

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

function toArrayBuffer(src: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(src.byteLength)
  new Uint8Array(buf).set(src)
  return buf
}

/* ---------- PBKDF2 → AES-GCM key (used for wrapping the private key) ---------- */

const WRAP_ITER = 200_000 // sub-second on modern hardware; lower than login hash but reused as KEK
const WRAP_SALT_BYTES = 16

async function deriveWrappingKey(
  password: string,
  saltB64: string,
): Promise<CryptoKey> {
  const saltBuf = toArrayBuffer(b64ToBytes(saltB64))
  const passBuf = toArrayBuffer(enc.encode(password))
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passBuf,
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations: WRAP_ITER,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/* ---------- ECDH keypair generation + import/export ---------- */

export async function generateKeypair(): Promise<{
  publicKeyJwk: JsonWebKey
  privateKey: CryptoKey
}> {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  )
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
  return { publicKeyJwk, privateKey: kp.privateKey }
}

async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
}

async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  )
}

/* ---------- private-key wrap / unwrap (password-derived AES-GCM KEK) ---------- */

export async function wrapPrivateKey(
  privateKey: CryptoKey,
  password: string,
): Promise<{ wrappedPrivateJwk: string; wrappingSalt: string; wrappingIv: string }> {
  const privateJwk = await crypto.subtle.exportKey('jwk', privateKey)
  const saltBytes = crypto.getRandomValues(new Uint8Array(WRAP_SALT_BYTES))
  const ivBytes = crypto.getRandomValues(new Uint8Array(12))
  const saltB64 = bytesToB64(saltBytes)
  const ivB64 = bytesToB64(ivBytes)

  const kek = await deriveWrappingKey(password, saltB64)
  const plaintext = toArrayBuffer(enc.encode(JSON.stringify(privateJwk)))
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
    kek,
    plaintext,
  )
  return {
    wrappedPrivateJwk: bytesToB64(new Uint8Array(ctBuf)),
    wrappingSalt: saltB64,
    wrappingIv: ivB64,
  }
}

export async function unwrapPrivateKey(
  wrappedPrivateJwk: string,
  wrappingSalt: string,
  wrappingIv: string,
  password: string,
): Promise<CryptoKey> {
  const kek = await deriveWrappingKey(password, wrappingSalt)
  const ciphertext = toArrayBuffer(b64ToBytes(wrappedPrivateJwk))
  const ivBuf = toArrayBuffer(b64ToBytes(wrappingIv))
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, kek, ciphertext)
  const text = new TextDecoder().decode(plainBuf)
  const jwk = JSON.parse(text) as JsonWebKey
  return importPrivateKey(jwk)
}

/* ---------- ECDH shared secret -> HKDF -> AES-GCM key ---------- */

async function deriveAesKey(
  myPrivateKey: CryptoKey,
  theirPublicJwk: JsonWebKey,
  context: Uint8Array,
): Promise<CryptoKey> {
  const theirPub = await importPublicKey(theirPublicJwk)
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPub },
    myPrivateKey,
    256,
  )
  const ikm = new Uint8Array(sharedBits)
  const ikmBuf = toArrayBuffer(ikm)
  const saltBuf = toArrayBuffer(context)

  const baseKey = await crypto.subtle.importKey('raw', ikmBuf, 'HKDF', false, ['deriveKey'])
  // HKDF info binds the key to a specific chat so the same shared secret
  // can't be reused across DMs.
  const info = enc.encode('cipherchat/v1/' + new TextDecoder().decode(context))
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBuf, info: toArrayBuffer(info) },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function ctxBytes(...parts: string[]): Uint8Array {
  // Stable serialization; callers should sort participating ids for groups.
  const s = parts.sort().join('|')
  return enc.encode(s)
}

/* ---------- DM ---------- */

export async function deriveDmSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicJwk: JsonWebKey,
  userIdA: string,
  userIdB: string,
): Promise<CryptoKey> {
  return deriveAesKey(myPrivateKey, theirPublicJwk, ctxBytes('dm', userIdA, userIdB))
}

export async function encryptDm(
  plaintext: string,
  myPrivateKey: CryptoKey,
  theirPublicJwk: JsonWebKey,
  userIdA: string,
  userIdB: string,
): Promise<{ ciphertext: string; iv: string; tag: string }> {
  const key = await deriveDmSharedKey(myPrivateKey, theirPublicJwk, userIdA, userIdB)
  const ivBytes = crypto.getRandomValues(new Uint8Array(12))
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
    key,
    toArrayBuffer(enc.encode(plaintext)),
  )
  const ct = new Uint8Array(ctBuf)
  // AES-GCM in Web Crypto appends the 16-byte tag to the ciphertext. Split
  // it out so callers can store `iv`, `tag`, and `ciphertext` separately.
  const tag = ct.slice(ct.byteLength - 16)
  const ciphertext = ct.slice(0, ct.byteLength - 16)
  return { ciphertext: bytesToB64(ciphertext), iv: bytesToB64(ivBytes), tag: bytesToB64(tag) }
}

export async function decryptDm(
  ciphertextB64: string,
  ivB64: string,
  tagB64: string,
  myPrivateKey: CryptoKey,
  theirPublicJwk: JsonWebKey,
  userIdA: string,
  userIdB: string,
): Promise<string> {
  const key = await deriveDmSharedKey(myPrivateKey, theirPublicJwk, userIdA, userIdB)
  const ct = new Uint8Array(b64ToBytes(ciphertextB64))
  const tag = b64ToBytes(tagB64)
  const iv = toArrayBuffer(b64ToBytes(ivB64))
  const merged = new Uint8Array(ct.byteLength + tag.byteLength)
  merged.set(ct, 0)
  merged.set(tag, ct.byteLength)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(merged))
  return new TextDecoder().decode(plainBuf)
}

/* ---------- Group ---------- */

export async function generateGroupKey(): Promise<{ rawB64: string; key: CryptoKey }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  return { rawB64: bytesToB64(raw), key }
}

/**
 * Wrap a raw group key (base64) inside an AES-GCM envelope encrypted with
 * a key derived from `ECDH(adminPriv, memberPub)` for a specific group.
 */
export async function wrapGroupKeyForMember(
  rawGroupKeyB64: string,
  adminPrivateKey: CryptoKey,
  memberPublicJwk: JsonWebKey,
  groupId: string,
  memberId: string,
): Promise<{ wrappedKey: string; iv: string }> {
  const envelopeKey = await deriveAesKey(
    adminPrivateKey,
    memberPublicJwk,
    ctxBytes('group-envelope', groupId, memberId),
  )
  const ivBytes = crypto.getRandomValues(new Uint8Array(12))
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
    envelopeKey,
    toArrayBuffer(b64ToBytes(rawGroupKeyB64)),
  )
  return {
    wrappedKey: bytesToB64(new Uint8Array(ctBuf)),
    iv: bytesToB64(ivBytes),
  }
}

/** Reverse of `wrapGroupKeyForMember`. */
export async function unwrapGroupKeyForMember(
  wrappedKeyB64: string,
  ivB64: string,
  memberPrivateKey: CryptoKey,
  adminPublicJwk: JsonWebKey,
  groupId: string,
  memberId: string,
): Promise<CryptoKey> {
  const envelopeKey = await deriveAesKey(
    memberPrivateKey,
    adminPublicJwk,
    ctxBytes('group-envelope', groupId, memberId),
  )
  const ivBuf = toArrayBuffer(b64ToBytes(ivB64))
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf },
    envelopeKey,
    toArrayBuffer(b64ToBytes(wrappedKeyB64)),
  )
  const raw = new Uint8Array(plainBuf)
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** AES-GCM seal of a plaintext message with the (already-unwrapped) group key. */
export async function encryptGroupMessage(
  plaintext: string,
  groupKey: CryptoKey,
): Promise<{ ciphertext: string; iv: string; tag: string }> {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12))
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
    groupKey,
    toArrayBuffer(enc.encode(plaintext)),
  )
  const ct = new Uint8Array(ctBuf)
  const tag = ct.slice(ct.byteLength - 16)
  const ciphertext = ct.slice(0, ct.byteLength - 16)
  return { ciphertext: bytesToB64(ciphertext), iv: bytesToB64(ivBytes), tag: bytesToB64(tag) }
}

export async function decryptGroupMessage(
  ciphertextB64: string,
  ivB64: string,
  tagB64: string,
  groupKey: CryptoKey,
): Promise<string> {
  const ct = new Uint8Array(b64ToBytes(ciphertextB64))
  const tag = b64ToBytes(tagB64)
  const ivBuf = toArrayBuffer(b64ToBytes(ivB64))
  const merged = new Uint8Array(ct.byteLength + tag.byteLength)
  merged.set(ct, 0)
  merged.set(tag, ct.byteLength)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, groupKey, toArrayBuffer(merged))
  return new TextDecoder().decode(plainBuf)
}

/* ---------- raw AES-key import helper ---------- */

/**
 * Import a base64-encoded 256-bit AES-GCM key as a CryptoKey. Used when
 * caching a freshly-generated group key without round-tripping through
 * `unwrapGroupKeyForMember` on the same device.
 */
export async function importGroupKey(rawGroupKeyB64: string): Promise<CryptoKey> {
  const raw = new Uint8Array(b64ToBytes(rawGroupKeyB64))
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

/* ---------- password hashing exports (re-exported so App.tsx has one import) ---------- */

export const hashPassword = _hashPasswordForWrap
export const verifyPassword = _verifyPasswordForWrap
