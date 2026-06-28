import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Group, Message, User, UserId } from '../types'
import { Users } from '../storage'
import { avatarColor, formatTimeOnly, initials } from '../utils'
import { EncryptedBadge } from './EncryptedBadge'
import { TypingIndicator, type TypingUser } from './TypingIndicator'
import { MessageStatus, type DeliveryStatus } from './MessageStatus'
import { markSeen } from '../presence'

/** Message augmented with a decrypted plaintext string for display. */
export type DisplayMessage = Message & { text: string }

export interface MessageCluster {
  mine: boolean
  fromId: UserId
  fromName: string
  fromColor: string
  items: DisplayMessage[]
}

export function clusterMessages(
  messages: DisplayMessage[],
  currentUserId: UserId,
  knownUsers: Map<UserId, { name: string; username: string }>,
): MessageCluster[] {
  const clusters: MessageCluster[] = []
  for (const msg of messages) {
    const mine = msg.fromId === currentUserId
    const last = clusters[clusters.length - 1]
    if (last && last.fromId === msg.fromId) {
      last.items.push(msg)
      continue
    }
    const u = knownUsers.get(msg.fromId)
    clusters.push({
      mine,
      fromId: msg.fromId,
      fromName: u ? u.name : `#${msg.fromId.slice(-7)}`,
      fromColor: avatarColor(msg.fromId),
      items: [msg],
    })
  }
  return clusters
}

type ChatKind = 'group' | 'dm'

/**
 * Delivery status for the most-recently-sent own message.
 * 'sending' is keyed on a queue of un-persisted messages keyed by their
 * draft hash; since the encryption roundtrip is normally < 50ms, this is
 * usually only visible as a momentary spinner.
 */
function initialStatuses(messages: DisplayMessage[], selfId: UserId): Map<string, DeliveryStatus> {
  const m = new Map<string, DeliveryStatus>()
  for (const msg of messages) {
    if (msg.fromId === selfId) m.set(msg.id, 'sent')
  }
  return m
}

export default function ChatView({
  currentUser,
  kind,
  group,
  dmUser,
  messages,
  typingUsers,
  onSelfTyping,
  viewKeyForTyping,
  onSend,
  onLeaveGroup,
}: {
  currentUser: User
  kind: ChatKind
  group: Group | null
  dmUser: User | null
  messages: DisplayMessage[]
  typingUsers: TypingUser[]
  onSelfTyping: (viewKey: string | null) => void
  viewKeyForTyping: string | null
  onSend: (text: string) => void
  onLeaveGroup?: () => void
}) {
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  // Per-message delivery status map. Defaults all own messages to 'sent'.
  const [statuses, setStatuses] = useState<Map<string, DeliveryStatus>>(
    () => initialStatuses(messages, currentUser.id),
  )

  // Keep status map in sync with messages list (avoid stale ids).
  // All persisted own messages are 'sent'. 'sending' is reserved for future
  // use if encryption ever becomes slow enough to observe halfway through.
  useEffect(() => {
    setStatuses((prev) => {
      const next = new Map<string, DeliveryStatus>()
      for (const m of messages) {
        if (m.fromId !== currentUser.id) continue
        next.set(m.id, prev.get(m.id) ?? 'sent')
      }
      return next
    })
  }, [messages.length, currentUser.id])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages.length])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [draft])

  // Keep presence fresh whenever the user opens or interacts with a chat.
  useEffect(() => {
    markSeen(currentUser.id)
  }, [currentUser.id, kind, group?.id, dmUser?.id])

  function submit() {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
    // Stop broadcasting typing once sent.
    onSelfTyping(null)
    taRef.current?.focus()
  }

  function onDraftChange(v: string) {
    setDraft(v)
    onSelfTyping(v ? viewKeyForTyping : null)
    if (v) markSeen(currentUser.id)
  }

  async function copyCode() {
    if (!group) return
    try {
      await navigator.clipboard.writeText(group.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy group code:', group.code)
    }
  }

  const title = kind === 'group'
    ? (group?.name ?? 'Group')
    : (dmUser?.displayName ?? 'Direct message')
  const subtitle = kind === 'group'
    ? `${group?.memberIds.length ?? 0} members · code ${group?.code ?? ''}`
    : dmUser ? `@${dmUser.username}` : ''

  const participantsMap = useMemo(
    () => participantsAsMap(kind, group, dmUser),
    [kind, group?.id, dmUser?.id],
  )

  return (
    <section className="chat">
      <header className="chat-head">
        <div className="chat-head-text">
          <div className="chat-head-title-row">
            <h2 className="chat-title">{title}</h2>
            <EncryptedBadge kind={kind} />
          </div>
          {subtitle && <div className="chat-sub">{subtitle}</div>}
        </div>
        <div className="chat-head-actions">
          {kind === 'group' && group && (
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={copyCode}
                title="Copy invite code"
              >
                {copied ? '✓ Copied' : 'Copy code'}
              </button>
              {onLeaveGroup && group.memberIds.length > 1 && (
                <button
                  type="button"
                  className="btn danger-ghost"
                  onClick={() => {
                    if (window.confirm(`Leave "${group.name}"?`)) onLeaveGroup()
                  }}
                >
                  Leave
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <TypingIndicator users={typingUsers} kind={kind} />

      <div className="scroll" ref={scrollRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <EmptyChat kind={kind} group={group} dmUser={dmUser} />
        ) : (
          <RenderedBubbles
            messages={messages}
            currentUserId={currentUser.id}
            knownUsers={participantsMap}
            statuses={statuses}
          />
        )}
      </div>

      <footer className="composer">
        <div className="composer-field">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={
              kind === 'group'
                ? `Message ${group?.name ?? 'group'}…`
                : `Message @${dmUser?.username ?? 'user'}…`
            }
            rows={1}
            aria-label="Message"
          />
          <div className="composer-hint" aria-hidden="true">
            <kbd>Enter</kbd> to send
            <span className="composer-hint-sep">·</span>
            <kbd>Shift</kbd>+<kbd>Enter</kbd> newline
          </div>
        </div>
        <button
          type="button"
          className="btn primary send"
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Send message"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12l14-7-4 16-3-7-7-2z" />
            <line x1="12" y1="14" x2="19" y2="5" />
          </svg>
        </button>
      </footer>
    </section>
  )
}

interface KnownUser {
  id: UserId
  name: string
  username: string
}

function participantsAsMap(
  kind: ChatKind,
  group: Group | null,
  dmUser: User | null,
): Map<UserId, KnownUser> {
  const m = new Map<UserId, KnownUser>()
  if (kind === 'dm') {
    if (dmUser) add(m, dmUser)
    return m
  }
  if (group) {
    for (const id of group.memberIds) {
      const u = Users.byId(id)
      if (u) add(m, u)
    }
  }
  return m
}

function add(m: Map<UserId, KnownUser>, u: User) {
  m.set(u.id, { id: u.id, name: u.displayName, username: u.username })
}

function RenderedBubbles({
  messages,
  currentUserId,
  knownUsers,
  statuses,
}: {
  messages: DisplayMessage[]
  currentUserId: UserId
  knownUsers: Map<UserId, KnownUser>
  statuses: Map<string, DeliveryStatus>
}) {
  const clusters = clusterMessages(
    messages,
    currentUserId,
    knownUsers as unknown as Map<UserId, { name: string; username: string }>,
  )

  const elements: React.ReactNode[] = []
  let prevDayLabel: string | null = null

  clusters.forEach((c, ci) => {
    const firstTs = c.items[0].timestamp
    const day = dayLabel(firstTs)
    if (day && day !== prevDayLabel) {
      elements.push(
        <div className="day-divider" key={`d-${ci}-${firstTs}`}>
          <span>{day}</span>
        </div>,
      )
      prevDayLabel = day
    }

    elements.push(
      <div
        key={`c-${ci}-${c.fromId}-${firstTs}`}
        className={'msg-cluster' + (c.mine ? ' mine' : ' theirs')}
      >
        {!c.mine && (
          <span
            className="avatar sm"
            style={{ background: c.fromColor }}
            aria-hidden="true"
          >
            {initials(c.fromName)}
          </span>
        )}
        <div className="msg-stack">
          {!c.mine && <div className="msg-author">{c.fromName}</div>}
          {c.items.map((m, mi) => {
            const lastInCluster = mi === c.items.length - 1
            const status = c.mine && lastInCluster ? statuses.get(m.id) ?? 'sent' : undefined
            return (
              <div className={'bubble' + (c.mine ? ' mine' : '')} key={m.id}>
                <div className="bubble-text">{m.text}</div>
                <div className="bubble-meta">
                  <span className="bubble-time" aria-hidden="true">
                    {formatTimeOnly(m.timestamp)}
                  </span>
                  {status && <MessageStatus status={status} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>,
    )
  })

  return <>{elements}</>
}

function dayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return 'Today'
  }
  today.setDate(today.getDate() - 1)
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return 'Yesterday'
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function EmptyChat({
  kind,
  group,
  dmUser,
}: {
  kind: ChatKind
  group: Group | null
  dmUser: User | null
}) {
  return (
    <div className="chat-empty">
      <div className="chat-empty-emoji" aria-hidden="true">💬</div>
      <p>
        {kind === 'group'
          ? `Welcome to "${group?.name ?? 'this group'}". Send the first message.`
          : `No messages with @${dmUser?.username ?? 'user'} yet. Say hello!`}
      </p>
    </div>
  )
}
