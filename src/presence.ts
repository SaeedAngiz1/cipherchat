/**
 * Lightweight presence + typing tracker.
 *
 * Single source of truth is a small localStorage record at KEY. Any time we
 * mutate, we emit a custom `cc:presence` event so same-tab subscribers tick.
 * Cross-tab subscribers tick via the native `storage` event.
 *
 * Schema:
 *   {
 *     lastSeen: { [userId]: tsMs },
 *     typing:   { [userId::viewKey]: tsMs }
 *   }
 *
 * `isOnline` uses a 5-minute freshness window. `getTypingUsers` excludes
 * stale typing (>4s since last keystroke) so a user who stops typing
 * automatically drops off.
 */

const KEY = 'cc.presence'

/** Threshold for "active now" — anything older is offline. */
export const ONLINE_THRESHOLD_MS = 5 * 60_000
/** Stale-typing decay — users who stopped typing fade after this. */
const TYPING_DECAY_MS = 4_000

export interface Presence {
  lastSeen: Record<string, number>
  typing: Record<string, number>
}

function load(): Presence {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { lastSeen: {}, typing: {} }
    const v = JSON.parse(raw) as Partial<Presence> | null
    return {
      lastSeen: v?.lastSeen ?? {},
      typing: v?.typing ?? {},
    }
  } catch {
    return { lastSeen: {}, typing: {} }
  }
}

function save(p: Presence) {
  localStorage.setItem(KEY, JSON.stringify(p))
  window.dispatchEvent(new CustomEvent('cc:presence'))
}

export function markSeen(userId: string) {
  const p = load()
  // No-op if the timestamp is the same millisecond (avoids storage churn).
  if (p.lastSeen[userId] === Date.now()) return
  p.lastSeen[userId] = Date.now()
  save(p)
}

export function markTyping(userId: string, viewKey: string) {
  const p = load()
  p.typing[`${userId}::${viewKey}`] = Date.now()
  save(p)
}

export function subscribe(cb: () => void): () => void {
  window.addEventListener('cc:presence', cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener('cc:presence', cb)
    window.removeEventListener('storage', cb)
  }
}

export function snapshot(now = Date.now()): Presence {
  const p = load()
  // Drop stale typing entries on read (cheap GC).
  let dirty = false
  for (const k of Object.keys(p.typing)) {
    if (now - (p.typing[k] ?? 0) > TYPING_DECAY_MS) {
      delete p.typing[k]
      dirty = true
    }
  }
  if (dirty) save(p)
  return p
}

/** Pure: was the user active within the online window? */
export function isOnline(
  lastSeen: number | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastSeen) return false
  return now - lastSeen < ONLINE_THRESHOLD_MS
}

/** Pure: human-readable "active now" / "5m ago" / "2h ago" / date. */
export function lastSeenLabel(
  lastSeen: number | undefined,
  now: number = Date.now(),
): string {
  if (!lastSeen) return 'never seen'
  if (isOnline(lastSeen, now)) return 'active now'
  const diff = now - lastSeen
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `last seen ${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `last seen ${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `last seen ${days}d ago`
  return `last seen ${new Date(lastSeen).toLocaleDateString()}`
}

/** Pure: which user ids have a fresh typing record for `viewKey`? */
export function getTypingUsers(
  typing: Record<string, number>,
  viewKey: string,
  now: number = Date.now(),
  excludeUserId?: string,
): string[] {
  const out: string[] = []
  for (const k of Object.keys(typing)) {
    const sep = k.indexOf('::')
    if (sep === -1) continue
    const uid = k.slice(0, sep)
    const vk = k.slice(sep + 2)
    if (vk !== viewKey) continue
    const t = typing[k] ?? 0
    if (now - t > TYPING_DECAY_MS) continue
    if (excludeUserId && uid === excludeUserId) continue
    out.push(uid)
  }
  return out
}

export function viewKeyOf(kind: 'dm' | 'group', id: string): string {
  return kind === 'dm' ? `dm:${id}` : `group:${id}`
}
