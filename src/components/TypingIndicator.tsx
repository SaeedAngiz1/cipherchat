import type { UserId } from '../types'
import { avatarColor, initials } from '../utils'

/** Minimal typing-user descriptor so this component doesn't import User type. */
export interface TypingUser {
  id: UserId
  /** Display name — first word preferred. */
  name: string
}

export function TypingIndicator({
  users,
  kind = 'group',
}: {
  users: TypingUser[]
  kind?: 'group' | 'dm'
}) {
  if (users.length === 0) return null
  const n = users.length
  const first = users[0]?.name ?? '…'
  const second = users[1]?.name
  const phrase =
    n === 1
      ? `${first} is typing`
      : n === 2
        ? `${first} and ${second} are typing`
        : kind === 'dm' && false // (kept for explicitness; n===2 already handled above)
          ? `${first} is typing`
          : `${n} people are typing`
  return (
    <div className="typing-indicator" role="status" aria-live="polite">
      <span className="typing-stack" aria-hidden="true">
        {users.slice(0, 3).map((u) => (
          <span
            key={u.id}
            className="typing-avatar"
            style={{ background: avatarColor(u.id) }}
          >
            {initials(u.name)}
          </span>
        ))}
      </span>
      <span className="typing-text">{phrase}</span>
      <span className="typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}
