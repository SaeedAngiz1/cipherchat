import type { Group, User } from '../types'
import { avatarColor, initials } from '../utils'
import { BrandFooter } from './BrandFooter'

/**
 * Full-bleed welcome dashboard shown in the main pane when no chat is
 * selected. Built to feel like a friendly launchpad instead of an empty
 * gray rectangle: greeting, stat tiles, three action cards.
 */
export function WelcomeScreen({
  currentUser,
  groups,
  dmPartners,
  messagesSent,
  onCreateGroup,
  onJoinGroup,
  onNewDM,
  onOpenAbout,
  onOpenPrivacy,
}: {
  currentUser: User
  groups: Group[]
  dmPartners: User[]
  messagesSent: number
  onCreateGroup: () => void
  onJoinGroup: () => void
  onNewDM: () => void
  onOpenAbout: () => void
  onOpenPrivacy: () => void
}) {
  const hour = new Date().getHours()
  const greeting =
    hour < 5
      ? 'Still up'
      : hour < 12
        ? 'Good morning'
        : hour < 18
          ? 'Good afternoon'
          : 'Good evening'

  const initialsMe = initials(currentUser.displayName || currentUser.username)

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-greeting">
          <span className="welcome-avatar" style={{ background: avatarColor(currentUser.id) }}>
            {initialsMe}
          </span>
          <div className="welcome-greet-text">
            <span className="welcome-greet-label">{greeting},</span>
            <span className="welcome-greet-name">@{currentUser.username}</span>
            <span className="welcome-greet-sub">
              {currentUser.displayName
                && currentUser.displayName.toLowerCase() !== currentUser.username.toLowerCase()
                ? `(${currentUser.displayName})`
                : 'Pick a conversation, or start a new one.'}
            </span>
          </div>
        </div>

        <div className="welcome-stats">
          <div className="welcome-stat">
            <div className="welcome-stat-num">{groups.length}</div>
            <div className="welcome-stat-label">groups</div>
          </div>
          <div className="welcome-stat">
            <div className="welcome-stat-num">{dmPartners.length}</div>
            <div className="welcome-stat-label">conversations</div>
          </div>
          <div className="welcome-stat">
            <div className="welcome-stat-num">{messagesSent}</div>
            <div className="welcome-stat-label">messages</div>
          </div>
        </div>

        <div className="welcome-actions">
          <button
            className="welcome-card welcome-card-primary"
            onClick={onCreateGroup}
            type="button"
          >
            <span className="welcome-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <div className="welcome-card-text">
              <div className="welcome-card-title">New group</div>
              <div className="welcome-card-sub">Spin up an encrypted room and share the invite code.</div>
            </div>
          </button>

          <button className="welcome-card" onClick={onJoinGroup} type="button">
            <span className="welcome-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7l9 6 9-6" />
                <rect x="3" y="5" width="18" height="14" rx="2" />
              </svg>
            </span>
            <div className="welcome-card-text">
              <div className="welcome-card-title">Join with code</div>
              <div className="welcome-card-sub">Enter a 6-character code to join an existing group.</div>
            </div>
          </button>

          <button className="welcome-card" onClick={onNewDM} type="button">
            <span className="welcome-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.4 8.4 0 0 1-3.7-.9L3 21l1.9-5.9A8.4 8.4 0 1 1 21 11.5z" />
              </svg>
            </span>
            <div className="welcome-card-text">
              <div className="welcome-card-title">New DM</div>
              <div className="welcome-card-sub">Message another signed-in user directly.</div>
            </div>
          </button>
        </div>

        <BrandFooter
          variant="welcome"
          onOpenAbout={onOpenAbout}
          onOpenPrivacy={onOpenPrivacy}
        />
      </div>
    </div>
  )
}
