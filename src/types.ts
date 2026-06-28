export type UserId = string
export type GroupId = string
export type MessageId = string

export interface User {
  id: UserId
  username: string // globally unique
  displayName: string
  passwordHash: string // pbkdf2$<iter>$<salt-b64>$<hash-b64>
  /** ECDH P-256 public key, stored as JSON Web Key for portability. */
  publicKeyJwk?: JsonWebKey
  createdAt: number
}

/**
 * Stored, password-wrapped private ECDH key.
 * `wrappedPrivateJwk` is the AES-GCM ciphertext (base64) of the JSON-serialized
 * private JWK. Unwrapping requires the user's password (used to derive the
 * wrapping key via PBKDF2 — see crypto.ts).
 */
export interface KeypairRecord {
  userId: UserId
  wrappedPrivateJwk: string // base64
  wrappingSalt: string // base64
  wrappingIv: string // base64
}

/**
 * Per-member symmetric "envelope" of a group's random AES key.
 * Wrapped with the recipient's ECDH public key so only that member can
 * unwrap once they hold their (password-decrypted) private key.
 */
export interface GroupKeyEnvelope {
  groupId: GroupId
  userId: UserId
  /** base64 AES-GCM ciphertext of the random group key (32 bytes) */
  wrappedKey: string
  /** base64 IV used by `wrappedKey` */
  iv: string
}

export interface Group {
  id: GroupId
  code: string // globally unique join code
  name: string
  description: string
  adminId: UserId
  memberIds: UserId[]
  createdAt: number
}

export type ChatKind = 'dm' | 'group'

/**
 * Stored message. Body is encrypted; UI decrypts at render time.
 *  - DM: `ciphertext` is the AES-GCM $(\text{plaintext}, \text{AAD} = \text{public chat context})$.
 *  - Group: same, using the group's symmetric key (which the recipient unwraps via envelope).
 */
export interface Message {
  id: MessageId
  kind: ChatKind
  fromId: UserId
  toUserId?: UserId
  groupId?: GroupId
  /** base64 AES-GCM ciphertext of the plaintext. */
  ciphertext: string
  /** base64 IV (12 bytes) for the AES-GCM seal. */
  iv: string
  /** base64 of ciphertext auth tag (16 bytes), re-attached for clarity. */
  tag: string
  timestamp: number
}
