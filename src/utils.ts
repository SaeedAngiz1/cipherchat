/** Shared, dependency-free helpers used by both Sidebar and ChatView. */

/**
 * Deterministic, pleasant color for a user/group id.
 * Uses a small hand-picked palette so chips remain on-brand.
 */
const PALETTE = [
  '#7c5cff', // indigo (brand)
  '#ff6b9a', // pink
  '#38c5e0', // teal
  '#ffb83a', // amber
  '#6dd58c', // mint
  '#f2685a', // coral
  '#8a8aff', // periwinkle
  '#e48aff', // violet
]

export function avatarColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0
  }
  return PALETTE[h % PALETTE.length]
}

/**
 * Up-to-two-character initials for display in avatar chips.
 * - Empty input → "?"
 * - Single word  → first letter only (single character)
 * - Two or more words → first letter of first + last word
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) {
    return (parts[0][0] ?? '?').toUpperCase()
  }
  return ((parts[0][0] ?? '?') + (parts[parts.length - 1][0] ?? '?')).toUpperCase()
}

/**
 * Format a timestamp for the chat list / message bubbles.
 * - Today  →  HH:MM
 * - Yesterday  →  "Yesterday"
 * - Older this year  →  "MMM D"
 * - Different year  →  "MMM D, YYYY"
 */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const yest = new Date(now)
  yest.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  if (isYesterday) return 'Yesterday'
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Format a "HH:MM" stamp for bubble timestamps. */
export function formatTimeOnly(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
