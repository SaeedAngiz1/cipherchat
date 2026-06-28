import { isOnline, lastSeenLabel } from '../presence'

/**
 * Status dot overlay for an avatar. Rendered absolutely-positioned at the
 * bottom-right of an `.avatar-wrap` container so the parent handles layout.
 *
 * Colors:
 *  - .online  → green (active within 5 minutes)
 *  - .offline → muted gray (older or never)
 *
 * Returns null when no lastSeen value exists so it doesn't visually leak.
 */
export function PresenceDot({
  lastSeen,
  className = '',
}: {
  lastSeen?: number
  className?: string
}) {
  if (lastSeen === undefined) return null
  const online = isOnline(lastSeen)
  return (
    <span
      className={`presence-dot ${online ? 'online' : 'offline'} ${className}`}
      aria-label={online ? 'Active now' : 'Offline'}
      title={lastSeenLabel(lastSeen)}
    />
  )
}
