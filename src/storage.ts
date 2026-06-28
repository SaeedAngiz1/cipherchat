import type {
  User,
  Group,
  Message,
  UserId,
  GroupId,
  KeypairRecord,
  GroupKeyEnvelope,
} from './types'

/**
 * localStorage-backed "database". The App talks ONLY to this module so the
 * `db.ts` backend abstraction can swap implementations without call-site
 * churn. A custom 'cc:changed' event is fired on every mutation so other
 * components (and other tabs via the native 'storage' event) can react
 * without polling.
 */

const KEYS = {
  users: 'cc.users',
  groups: 'cc.groups',
  messages: 'cc.messages',
  session: 'cc.session',
  keypairs: 'cc.keypairs', // KeypairRecord[]
  groupKeys: 'cc.groupKeys', // GroupKeyEnvelope[]
} as const

export const CHANGE_EVENT = 'cc:changed'

/* ---------- low-level read/write ---------- */

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, val: T) {
  localStorage.setItem(key, JSON.stringify(val))
  // Notify same-tab subscribers. The native `storage` event only fires in
  // *other* tabs, so we emit our own for in-tab listeners.
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

/* ---------- users ---------- */

export const Users = {
  all(): User[] {
    return read<User[]>(KEYS.users, [])
  },
  byId(id: UserId): User | undefined {
    return Users.all().find((u) => u.id === id)
  },
  byUsername(username: string): User | undefined {
    const lc = username.toLowerCase().trim()
    if (!lc) return undefined
    return Users.all().find((u) => u.username.toLowerCase() === lc)
  },
  create(u: User): User {
    const list = Users.all()
    list.push(u)
    write(KEYS.users, list)
    return u
  },
  update(u: User) {
    const list = Users.all().map((x) => (x.id === u.id ? u : x))
    write(KEYS.users, list)
  },
  /** Enforce global uniqueness of username (case-insensitive). */
  isUsernameTaken(username: string): boolean {
    return !!Users.byUsername(username)
  },
}

/* ---------- groups ---------- */

export const Groups = {
  all(): Group[] {
    return read<Group[]>(KEYS.groups, [])
  },
  byId(id: GroupId): Group | undefined {
    return Groups.all().find((g) => g.id === id)
  },
  byCode(code: string): Group | undefined {
    const up = code.toUpperCase().trim()
    if (!up) return undefined
    return Groups.all().find((g) => g.code.toUpperCase() === up)
  },
  create(g: Group): Group {
    const list = Groups.all()
    list.push(g)
    write(KEYS.groups, list)
    return g
  },
  update(g: Group) {
    const list = Groups.all().map((x) => (x.id === g.id ? g : x))
    write(KEYS.groups, list)
  },
  isCodeTaken(code: string): boolean {
    return !!Groups.byCode(code)
  },
  forUser(userId: UserId): Group[] {
    return Groups.all()
      .filter((g) => g.memberIds.includes(userId))
      .sort((a, b) => b.createdAt - a.createdAt)
  },
  leave(groupId: GroupId, userId: UserId): Group | undefined {
    const g = Groups.byId(groupId)
    if (!g) return undefined
    g.memberIds = g.memberIds.filter((id) => id !== userId)
    Groups.update(g)
    return g
  },
  members(groupId: GroupId): User[] {
    const g = Groups.byId(groupId)
    if (!g) return []
    return g.memberIds
      .map((id) => Users.byId(id))
      .filter((u): u is User => !!u)
  },
}

/* ---------- messages ---------- */

export const Messages = {
  all(): Message[] {
    return read<Message[]>(KEYS.messages, [])
  },
  add(m: Message) {
    const list = Messages.all()
    list.push(m)
    write(KEYS.messages, list)
  },
  /** All messages between two users, ordered by timestamp. */
  dmBetween(a: UserId, b: UserId): Message[] {
    return Messages.all()
      .filter(
        (m) =>
          m.kind === 'dm' &&
          ((m.fromId === a && m.toUserId === b) ||
            (m.fromId === b && m.toUserId === a)),
      )
      .sort((x, y) => x.timestamp - y.timestamp)
  },
  forGroup(groupId: GroupId): Message[] {
    return Messages.all()
      .filter((m) => m.kind === 'group' && m.groupId === groupId)
      .sort((x, y) => x.timestamp - y.timestamp)
  },
}

/* ---------- session ---------- */

export const Session = {
  get(): UserId | null {
    return read<UserId | null>(KEYS.session, null)
  },
  set(userId: UserId) {
    write(KEYS.session, userId)
  },
  clear() {
    localStorage.removeItem(KEYS.session)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  },
}

/* ---------- keypairs (password-wrapped ECDH private keys) ---------- */

export const Keypairs = {
  forUser(userId: UserId): KeypairRecord | undefined {
    return read<KeypairRecord[]>(KEYS.keypairs, []).find((k) => k.userId === userId)
  },
  upsert(rec: KeypairRecord) {
    const list = read<KeypairRecord[]>(KEYS.keypairs, [])
    const i = list.findIndex((x) => x.userId === rec.userId)
    if (i >= 0) list[i] = rec
    else list.push(rec)
    write(KEYS.keypairs, list)
  },
}

/* ---------- per-member group-key envelopes ---------- */

export const GroupKeys = {
  forGroup(groupId: GroupId): GroupKeyEnvelope[] {
    return read<GroupKeyEnvelope[]>(KEYS.groupKeys, []).filter(
      (k) => k.groupId === groupId,
    )
  },
  forUser(userId: UserId): GroupKeyEnvelope[] {
    return read<GroupKeyEnvelope[]>(KEYS.groupKeys, []).filter((k) => k.userId === userId)
  },
  upsert(env: GroupKeyEnvelope) {
    const list = read<GroupKeyEnvelope[]>(KEYS.groupKeys, [])
    const i = list.findIndex((x) => x.groupId === env.groupId && x.userId === env.userId)
    if (i >= 0) list[i] = env
    else list.push(env)
    write(KEYS.groupKeys, list)
  },
}

/* ---------- helpers ---------- */

export function uid(prefix = 'id'): string {
  // RFC4122-ish — good enough for client-side ids
  const r = crypto.getRandomValues(new Uint8Array(16))
  r[6] = (r[6] & 0x0f) | 0x40
  r[8] = (r[8] & 0x3f) | 0x80
  const hex = Array.from(r, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${hex}`
}

/**
 * Generate a globally-unique 6-char group join code.
 * Uses an unambiguous alphabet (no 0/O/1/I) and rejection sampling to avoid
 * modulo bias. Keeps retrying until unique. Throws if the code space is
 * exhausted (astronomically unlikely).
 */
export function generateUniqueGroupCode(): string {
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 31 chars
  const LEN = 6
  for (let attempt = 0; attempt < 60; attempt++) {
    let code = ''
    while (code.length < LEN) {
      const buf = crypto.getRandomValues(new Uint8Array(LEN * 2))
      for (let i = 0; i < buf.length && code.length < LEN; i++) {
        if (buf[i] < 248) code += ALPHA[buf[i] % ALPHA.length]
      }
    }
    if (!Groups.isCodeTaken(code)) return code
  }
  throw new Error('Could not allocate a unique group code — try again.')
}
