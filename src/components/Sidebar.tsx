import { useMemo, useState } from 'react'
import type { Group, User, UserId, GroupId } from '../types'
import { Messages, Users } from '../storage'
import { avatarColor, initials, formatTimestamp } from '../utils'
import { PresenceDot } from './PresenceDot'
import { BrandFooter } from './BrandFooter'
import {
  isOnline,
  lastSeenLabel,
  snapshot as snapshotPresence,
  type Presence,
} from '../presence'

type View =
  | { kind: 'dm'; otherUserId: UserId }
  | { kind: 'group'; groupId: GroupId }

export default function Sidebar({
  currentUser,
  groups,
  dmPartners,
  activeView,
  onSelectGroup,
  onSelectDM,
  onCreateGroup,
  onJoinGroup,
  onNewDM,
  onLogout,
  presenceVersion,
  onOpenAbout,
  onOpenPrivacy,
}: {
  currentUser: User
  groups: Group[]
  dmPartners: User[]
  activeView: View | null
  onSelectGroup: (id: GroupId) => void
  onSelectDM: (id: UserId) => void
  onCreateGroup: () => void
  onJoinGroup: () => void
  onNewDM: () => void
  onLogout: () => void
  /* Re-render trigger from App — re-reads the presence snapshot whenever
     localStorage fires. Sidebar keeps no own subscription because the
     global App-level one already drives both views. */
  presenceVersion: number
  onOpenAbout: () => void
  onOpenPrivacy: () => void
}) {
  const [filter, setFilter] = useState('')
  const lc = filter.trim().toLowerCase()

  const sortedGroups = useMemo(
    () =>
      groups.slice().sort((a, b) => {
        const ta = lastGroupTs(a.id)
        const tb = lastGroupTs(b.id)
        return tb - ta
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups],
  )

  const sortedDMs = useMemo(
    () =>
      dmPartners
        .slice()
        .sort((a, b) => {
          const ta = lastDmTs(currentUser.id, a.id)
          const tb = lastDmTs(currentUser.id, b.id)
          return tb - ta
        }),
    [dmPartners, currentUser.id],
  )

  const fGroups = lc
    ? sortedGroups.filter(
        (g) =>
          g.name.toLowerCase().includes(lc) ||
          g.code.toLowerCase().includes(lc),
      )
    : sortedGroups
  const fDMs = lc
    ? sortedDMs.filter(
        (u) =>
          u.username.toLowerCase().includes(lc) ||
          u.displayName.toLowerCase().includes(lc),
      )
    : sortedDMs

  // Read presence so we can show status dots on DM avatars. The `presenceVersion`
  // prop from App is the only signal that fires on storage events — re-rendering
  // is otherwise driven by group/DM list changes.
  const presence = useMemo<Presence>(() => {
    void presenceVersion
    return snapshotPresence()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceVersion, dmPartners.length, groups.length])

  return (
    <aside className="sidebar" aria-label="Conversations">
      <div className="sidebar-head">
        <div className="me">
          <span className="avatar-wrap">
            <span
              className="avatar"
              style={{ background: avatarColor(currentUser.id) }}
              aria-hidden="true"
            >
              {initials(currentUser.displayName || currentUser.username)}
            </span>
            <PresenceDot lastSeen={presence.lastSeen[currentUser.id]} />
          </span>
          <div className="me-text">
            <div className="me-name">{currentUser.displayName}</div>
            <div className="me-handle">@{currentUser.username}</div>
          </div>
        </div>
        <button
          className="icon-btn"
          aria-label="Sign out"
          title="Sign out"
          onClick={onLogout}
        >
          ⏻
        </button>
      </div>

      <div className="sidebar-actions">
        <button className="btn primary block" onClick={onCreateGroup}>
          ＋ New group
        </button>
        <div className="action-row">
          <button className="btn ghost flex" onClick={onJoinGroup}>
            Join with code
          </button>
          <button className="btn ghost flex" onClick={onNewDM}>
            New DM
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <span className="sidebar-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
        </span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search conversations…"
          aria-label="Search conversations"
          spellCheck={false}
        />
      </div>

      <nav className="conv-list" aria-label="Conversations list">
        {fGroups.length > 0 && (
          <div className="conv-section-title">Groups</div>
        )}
        {fGroups.map((g) => {
          const active =
            activeView?.kind === 'group' && activeView.groupId === g.id
          const lastMsgs = Messages.forGroup(g.id)
          const last = lastMsgs[lastMsgs.length - 1]
          const lastPreview = last
            ? `${shortAuthor(last.fromId)}: 🔒`
            : 'No messages yet'
          return (
            <button
              key={g.id}
              type="button"
              className={'conv-row' + (active ? ' active' : '')}
              onClick={() => onSelectGroup(g.id)}
            >
              <span className="avatar lg" style={{ background: avatarColor(g.id) }} aria-hidden="true">
                {initials(g.name)}
              </span>
              <span className="conv-text">
                <span className="conv-title">
                  <span className="conv-name">{g.name}</span>
                  <span className="conv-tag" title={`${g.memberIds.length} members`}>
                    · {g.memberIds.length}
                  </span>
                </span>
                <span className="conv-sub">{lastPreview}</span>
              </span>
              <span className="conv-meta">
                {last && <span className="conv-time">{formatTimestamp(last.timestamp)}</span>}
                <span className="conv-code" title={`Code: ${g.code}`}>
                  {g.code}
                </span>
              </span>
            </button>
          )
        })}

        {fDMs.length > 0 && (
          <div className="conv-section-title">Direct messages</div>
        )}
        {fDMs.map((u) => {
          const active =
            activeView?.kind === 'dm' && activeView.otherUserId === u.id
          const last = lastDm(currentUser.id, u.id)
          const lastPreview = last ? '🔒' : 'Say hello 👋'
          const lastSeen = presence.lastSeen[u.id]
          const subline = lastSeen
            ? (isOnline(lastSeen) ? '● active now' : `○ ${lastSeenLabel(lastSeen)}`)
            : '○ never seen'
          return (
            <button
              key={u.id}
              type="button"
              className={'conv-row' + (active ? ' active' : '')}
              onClick={() => onSelectDM(u.id)}
            >
              <span className="avatar-wrap">
                <span
                  className="avatar lg"
                  style={{ background: avatarColor(u.id) }}
                  aria-hidden="true"
                >
                  {initials(u.displayName || u.username)}
                </span>
                <PresenceDot lastSeen={lastSeen} />
              </span>
              <span className="conv-text">
                <span className="conv-title">
                  <span className="conv-name">{u.displayName}</span>
                  <span className="conv-tag">@{u.username}</span>
                </span>
                <span className="conv-sub">{lastPreview}</span>
                <span className={'conv-presence ' + (isOnline(lastSeen) ? 'online' : 'offline')}>
                  {subline}
                </span>
              </span>
              <span className="conv-meta">
                {last && <span className="conv-time">{formatTimestamp(last.timestamp)}</span>}
              </span>
            </button>
          )
        })}

        {fGroups.length === 0 && fDMs.length === 0 && (
          <div className="conv-empty">
            {lc
              ? 'No matching conversations.'
              : 'No conversations yet — create a group above.'}
          </div>
        )}
      </nav>

      <BrandFooter
        variant="sidebar"
        onOpenAbout={onOpenAbout}
        onOpenPrivacy={onOpenPrivacy}
      />
    </aside>
  )
}

/* ---------- helpers ---------- */

function lastGroupTs(groupId: GroupId): number {
  const m = Messages.forGroup(groupId)
  return m.length ? m[m.length - 1].timestamp : 0
}

function lastDm(a: UserId, b: UserId) {
  const m = Messages.dmBetween(a, b)
  return m[m.length - 1]
}

function lastDmTs(a: UserId, b: UserId): number {
  const last = lastDm(a, b)
  return last?.timestamp ?? 0
}

function shortAuthor(id: UserId): string {
  const u = Users.byId(id)
  if (!u) return 'someone'
  return u.displayName.split(' ')[0] || u.username
}
