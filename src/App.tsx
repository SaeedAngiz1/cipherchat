import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Group, GroupId, Message, User, UserId } from './types'
import {
  Groups,
  Keypairs,
  GroupKeys,
  Messages,
  Session,
  Users,
  generateUniqueGroupCode,
  uid,
  CHANGE_EVENT,
} from './storage'
import {
  decryptDm,
  decryptGroupMessage,
  encryptDm,
  encryptGroupMessage,
  generateGroupKey,
  generateKeypair,
  hashPassword,
  importGroupKey,
  unwrapGroupKeyForMember,
  unwrapPrivateKey,
  verifyPassword,
  wrapGroupKeyForMember,
  wrapPrivateKey,
} from './e2e'
import AuthScreen from './components/AuthScreen'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import Modal from './components/Modal'
import { WelcomeScreen } from './components/WelcomeScreen'
import { Toast, type ToastKind } from './components/Toast'
import { BrandFooter } from './components/BrandFooter'
import { AboutModal } from './components/AboutModal'
import { PrivacyModal } from './components/PrivacyModal'
import {
  markSeen,
  markTyping,
  subscribe as subscribePresence,
  snapshot as snapshotPresence,
  viewKeyOf,
  type Presence,
} from './presence'

const MAX_MSG = 4000

type View =
  | { kind: 'dm'; otherUserId: UserId }
  | { kind: 'group'; groupId: GroupId }

/** Stable primitive key for the active view (used in effect dependency arrays). */
function viewKey(view: View | null): string {
  if (!view) return 'none'
  return view.kind === 'dm'
    ? `dm:${view.otherUserId}`
    : `group:${view.groupId}`
}

type PlaintextMap = Map<string, string>

type HeldSecrets = {
  privateKey: CryptoKey
  groupKeys: Map<GroupId, CryptoKey>
}

type ToastState = { id: number; text: string; kind: ToastKind } | null

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [rev, setRev] = useState(0)
  const [modal, setModal] = useState<
    | null
    | { type: 'createGroup' }
    | { type: 'joinGroup' }
    | { type: 'newDM' }
    | { type: 'created'; code: string; name: string }
  >(null)
  // Global About / Privacy overlays — footer buttons and brand-credit link
  // both route here. Only one can be open at a time.
  const [infoModal, setInfoModal] = useState<'about' | 'privacy' | null>(null)
  const [secrets, setSecrets] = useState<HeldSecrets | null>(null)
  const [plaintext, setPlaintext] = useState<PlaintextMap>(new Map())
  // Toast stack — keep last one only; kind controls color.
  const [toast, setToast] = useState<ToastState>(null)
  // presence: latest typingByView recomputed whenever storage changes
  const [presenceVersion, setPresenceVersion] = useState(0)
  const toastIdRef = useRef(0)

  /* restore session on mount */
  useEffect(() => {
    const id = Session.get()
    if (!id) return
    const u = Users.byId(id)
    if (u) setCurrentUser(u)
    else Session.clear()
  }, [])

  /* React to mutations */
  useEffect(() => {
    const onChange = () => setRev((n) => n + 1)
    window.addEventListener(CHANGE_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  /* Subscribe to presence (typing + lastSeen) updates — cross-tab via storage
     event, same-tab via the custom 'cc:presence' event fired by markTyping
     and markSeen. */
  useEffect(() => {
    return subscribePresence(() => setPresenceVersion((n) => n + 1))
  }, [])

  /* Mark self as seen on small mouse/keyboard activity (throttled via a
     trailing 60s floor so we don't thrash localStorage). */
  useEffect(() => {
    if (!currentUser) return
    let last = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - last < 60_000) return
      last = now
      markSeen(currentUser.id)
    }
    window.addEventListener('mousemove', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity)
    return () => {
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('keydown', onActivity)
    }
  }, [currentUser?.id])

  /* Prime presence snapshot so the first render has data. */
  useEffect(() => {
    if (currentUser) markSeen(currentUser.id)
  }, [currentUser?.id])

  function showToast(text: string, kind: ToastKind = 'info') {
    const id = ++toastIdRef.current
    setToast({ id, text, kind })
    window.setTimeout(() => {
      setToast((t) => (t && t.id === id ? null : t))
    }, 3200)
  }

  /** Typing broadcaster — invoked from ChatView on every keystroke. */
  const onSelfTyping = useCallback(
    (viewKeyStr: string | null) => {
      if (!currentUser || !viewKeyStr) return
      markTyping(currentUser.id, viewKeyStr)
    },
    [currentUser?.id],
  )

  /** Per-view typing users excluding self. */
  const typingByView = useMemo<Record<string, Array<{ id: UserId; name: string }>>>(() => {
    if (!currentUser) return {}
    const snap = snapshotPresence() as Presence
    const active: Record<string, Array<{ id: UserId; name: string }>> = {}
    // One pass: skip self, otherwise bucket the userId under its viewKey.
    for (const k of Object.keys(snap.typing)) {
      const sep = k.indexOf('::')
      if (sep === -1) continue
      const uid = k.slice(0, sep)
      const vk = k.slice(sep + 2)
      if (uid === currentUser.id) continue
      const u = Users.byId(uid)
      active[vk] = active[vk] ?? []
      active[vk]!.push(u
        ? { id: u.id, name: u.displayName.split(' ')[0] || u.username }
        : { id: uid, name: '#' + uid.slice(-7) })
    }
    return active
    // presenceVersion forces recompute when storage events fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceVersion, currentUser?.id, rev])

  /* Decrypt incoming messages whenever the user's view / message set changes. */
  useEffect(() => {
    if (!secrets || !currentUser || !view) return
    const vk = viewKey(view)
    let cancelled = false
    void (async () => {
      const next = new Map<string, string>()
      try {
        if (view.kind === 'dm') {
          const partner = Users.byId(view.otherUserId)
          if (!partner?.publicKeyJwk) {
            if (!cancelled) setPlaintext(next)
            return
          }
          const list = Messages.dmBetween(currentUser.id, view.otherUserId)
          for (const m of list) {
            try {
              next.set(
                m.id,
                await decryptDm(
                  m.ciphertext,
                  m.iv,
                  m.tag,
                  secrets.privateKey,
                  partner.publicKeyJwk!,
                  currentUser.id,
                  view.otherUserId,
                ),
              )
            } catch {
              next.set(m.id, '🔒 (unable to decrypt)')
            }
          }
        } else {
          const env = GroupKeys.forUser(currentUser.id).find(
            (k) => k.groupId === view.groupId,
          )
          let groupKey = secrets.groupKeys.get(view.groupId) ?? null
          if (!groupKey && env) {
            const group = Groups.byId(view.groupId)
            const admin = group ? Users.byId(group.adminId) : null
            if (admin?.publicKeyJwk) {
              try {
                groupKey = await unwrapGroupKeyForMember(
                  env.wrappedKey,
                  env.iv,
                  secrets.privateKey,
                  admin.publicKeyJwk,
                  view.groupId,
                  currentUser.id,
                )
              } catch {
                groupKey = null
              }
            }
          }
          if (!groupKey) {
            if (!cancelled) setPlaintext(next)
            return
          }
          setSecrets((s) =>
            s ? { ...s, groupKeys: new Map(s.groupKeys).set(view.groupId, groupKey!) } : s,
          )
          const list = Messages.forGroup(view.groupId)
          for (const m of list) {
            try {
              next.set(
                m.id,
                await decryptGroupMessage(m.ciphertext, m.iv, m.tag, groupKey!),
              )
            } catch {
              next.set(m.id, '🔒 (unable to decrypt)')
            }
          }
        }
      } finally {
        if (!cancelled) setPlaintext(next)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secrets, viewKey(view), rev, currentUser?.id])

  /* ---------- auth (with E2E keypair generation) ---------- */

  async function handleRegister(
    username: string,
    displayName: string,
    password: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const cleanU = username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(cleanU)) {
      return { ok: false, error: 'Username must be 3–20 chars (a–z, 0–9, _).' }
    }
    if (Users.isUsernameTaken(cleanU)) {
      return { ok: false, error: 'That username is already taken.' }
    }
    if (password.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' }
    }
    const { publicKeyJwk, privateKey } = await generateKeypair()
    const wrapped = await wrapPrivateKey(privateKey, password)
    const u: User = {
      id: uid('usr'),
      username: cleanU,
      displayName: displayName.trim() || cleanU,
      passwordHash: await hashPassword(password),
      publicKeyJwk,
      createdAt: Date.now(),
    }
    Users.create(u)
    Keypairs.upsert({ userId: u.id, ...wrapped })
    Session.set(u.id)
    setCurrentUser(u)
    setSecrets({ privateKey, groupKeys: new Map() })
    setPlaintext(new Map())
    showToast(`Welcome, @${u.username}!`, 'success')
    return { ok: true }
  }

  async function handleLogin(
    username: string,
    password: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const u = Users.byUsername(username.trim())
    if (!u) return { ok: false, error: 'Invalid username or password.' }
    const ok = await verifyPassword(password, u.passwordHash)
    if (!ok) return { ok: false, error: 'Invalid username or password.' }
    let privateKey: CryptoKey | null = null
    const kp = Keypairs.forUser(u.id)
    if (kp) {
      try {
        privateKey = await unwrapPrivateKey(
          kp.wrappedPrivateJwk,
          kp.wrappingSalt,
          kp.wrappingIv,
          password,
        )
      } catch {
        privateKey = null
      }
    }
    if (!privateKey && u.publicKeyJwk) {
      const fresh = await generateKeypair()
      const wrapped = await wrapPrivateKey(fresh.privateKey, password)
      Keypairs.upsert({ userId: u.id, ...wrapped })
      Users.update({ ...u, publicKeyJwk: fresh.publicKeyJwk })
      privateKey = fresh.privateKey
    }
    Session.set(u.id)
    setCurrentUser(u)
    setSecrets(privateKey ? { privateKey, groupKeys: new Map() } : null)
    setPlaintext(new Map())
    showToast(`Welcome back, @${u.username}.`, 'success')
    return { ok: true }
  }

  function handleLogout() {
    Session.clear()
    setCurrentUser(null)
    setView(null)
    setSecrets(null)
    setPlaintext(new Map())
    showToast('Signed out.', 'info')
  }

  /* ---------- groups (with E2E group key seeding) ---------- */

  async function handleCreateGroup(
    name: string,
    description: string,
  ): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
    if (!currentUser || !secrets) return { ok: false, error: 'Not signed in.' }
    const cleanName = name.trim()
    if (cleanName.length < 2 || cleanName.length > 40) {
      return { ok: false, error: 'Group name must be 2–40 characters.' }
    }
    let code: string
    try {
      code = generateUniqueGroupCode()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
    const g: Group = {
      id: uid('grp'),
      code,
      name: cleanName,
      description: description.trim(),
      adminId: currentUser.id,
      memberIds: [currentUser.id],
      createdAt: Date.now(),
    }
    Groups.create(g)
    const { rawB64 } = await generateGroupKey()
    const env = await wrapGroupKeyForMember(
      rawB64,
      secrets.privateKey,
      currentUser.publicKeyJwk!,
      g.id,
      currentUser.id,
    )
    GroupKeys.upsert({ groupId: g.id, userId: currentUser.id, ...env })
    setView({ kind: 'group', groupId: g.id })
    setModal({ type: 'created', code, name: g.name })
    showToast(`Created “${g.name}”.`, 'success')
    return { ok: true, code }
  }

  async function handleJoinGroup(
    code: string,
  ): Promise<{ ok: true; alreadyMember?: boolean } | { ok: false; error: string }> {
    if (!currentUser || !secrets) return { ok: false, error: 'Not signed in.' }
    const clean = code.trim().toUpperCase()
    if (!clean) return { ok: false, error: 'Enter a group code.' }
    if (clean.length !== 6) {
      return { ok: false, error: 'Group codes are 6 characters.' }
    }
    const g = Groups.byCode(clean)
    if (!g) return { ok: false, error: 'No group found for that code.' }
    const alreadyMember = g.memberIds.includes(currentUser.id)
    if (!alreadyMember) {
      g.memberIds.push(currentUser.id)
      Groups.update(g)
      const { rawB64 } = await generateGroupKey()
      const env = await wrapGroupKeyForMember(
        rawB64,
        secrets.privateKey,
        currentUser.publicKeyJwk!,
        g.id,
        currentUser.id,
      )
      GroupKeys.upsert({ groupId: g.id, userId: currentUser.id, ...env })
      const preSeedKey = await importGroupKey(rawB64)
      setSecrets((s) =>
        s ? { ...s, groupKeys: new Map(s.groupKeys).set(g.id, preSeedKey) } : s,
      )
    }
    setView({ kind: 'group', groupId: g.id })
    setModal(null)
    showToast(alreadyMember ? `Already in “${g.name}”.` : `Joined “${g.name}”.`, 'success')
    return { ok: true, alreadyMember }
  }

  function handleLeaveGroup() {
    if (!currentUser || view?.kind !== 'group') return
    const g = Groups.byId(view.groupId)
    if (!g) return
    Groups.leave(g.id, currentUser.id)
    setView(null)
    showToast(`Left “${g.name}”.`, 'info')
  }

  /* ---------- DMs ---------- */

  function handleStartDM(
    username: string,
  ): { ok: true } | { ok: false; error: string } {
    if (!currentUser) return { ok: false, error: 'Not signed in.' }
    const target = Users.byUsername(username.trim())
    if (!target) return { ok: false, error: 'No user with that username.' }
    if (target.id === currentUser.id) {
      return { ok: false, error: "You can't DM yourself." }
    }
    setView({ kind: 'dm', otherUserId: target.id })
    setModal(null)
    showToast(`Chat with @${target.username}.`, 'success')
    return { ok: true }
  }

  /* ---------- messages (encrypt before store) ---------- */

  const handleSend = useCallback(
    async (text: string) => {
      if (!currentUser || !view || !secrets) return
      const clean = text.trim().slice(0, MAX_MSG)
      if (!clean) return
      try {
        let cipher: { ciphertext: string; iv: string; tag: string }
        if (view.kind === 'dm') {
          const partner = Users.byId(view.otherUserId)
          if (!partner?.publicKeyJwk) {
            showToast("Can't send: recipient hasn't set up E2E keys yet.", 'warn')
            return
          }
          cipher = await encryptDm(
            clean,
            secrets.privateKey,
            partner.publicKeyJwk,
            currentUser.id,
            view.otherUserId,
          )
        } else {
          const env = GroupKeys.forUser(currentUser.id).find(
            (k) => k.groupId === view.groupId,
          )
          const group = Groups.byId(view.groupId)
          const admin = group ? Users.byId(group.adminId) : null
          if (!env || !admin?.publicKeyJwk) {
            showToast("Can't send: group key not available.", 'warn')
            return
          }
          let groupKey = secrets.groupKeys.get(view.groupId) ?? null
          if (!groupKey) {
            groupKey = await unwrapGroupKeyForMember(
              env.wrappedKey,
              env.iv,
              secrets.privateKey,
              admin.publicKeyJwk,
              view.groupId,
              currentUser.id,
            )
            setSecrets((s) =>
              s
                ? { ...s, groupKeys: new Map(s.groupKeys).set(view.groupId, groupKey!) }
                : s,
            )
          }
          cipher = await encryptGroupMessage(clean, groupKey!)
        }
        const m: Message = {
          id: uid('msg'),
          kind: view.kind,
          fromId: currentUser.id,
          toUserId: view.kind === 'dm' ? view.otherUserId : undefined,
          groupId: view.kind === 'group' ? view.groupId : undefined,
          ...cipher,
          timestamp: Date.now(),
        }
        Messages.add(m)
        setPlaintext((p) => new Map(p).set(m.id, clean))
      } catch (e) {
        showToast(`Encryption failed: ${(e as Error).message}`, 'error')
      }
    },
    [currentUser, view, secrets],
  )

  const { myGroups, dmPartners, activeGroup, activeDMUser } = useMemo(() => {
    if (!currentUser) {
      return {
        myGroups: [] as Group[],
        dmPartners: [] as User[],
        activeGroup: null as Group | null,
        activeDMUser: null as User | null,
      }
    }
    const groups = Groups.forUser(currentUser.id)
    const ids = new Set<UserId>()
    for (const m of Messages.all()) {
      if (m.kind !== 'dm') continue
      if (m.fromId === currentUser.id && m.toUserId) ids.add(m.toUserId)
      if (m.toUserId === currentUser.id) ids.add(m.fromId)
    }
    const partners = Array.from(ids)
      .map((id) => Users.byId(id))
      .filter((u): u is User => !!u)
    let ag: Group | null = null
    let ad: User | null = null
    if (view) {
      if (view.kind === 'dm') {
        ad = Users.byId(view.otherUserId) ?? null
      } else {
        ag = Groups.byId(view.groupId) ?? null
      }
    }
    return { myGroups: groups, dmPartners: partners, activeGroup: ag, activeDMUser: ad }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, view, rev])

  /* Total messages sent by the current user (welcome-stats tile). */
  const messagesSent = useMemo(() => {
    if (!currentUser) return 0
    return Messages.all().filter((m) => m.fromId === currentUser.id).length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, rev])

  /* auto-pick first conversation if none selected */
  useEffect(() => {
    if (!currentUser || view) return
    const firstGroup = myGroups[0]
    if (firstGroup) setView({ kind: 'group', groupId: firstGroup.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, view, rev])

  if (!currentUser) {
    return <AuthScreen onRegister={handleRegister} onLogin={handleLogin} />
  }

  const typingForView = view ? typingByView[viewKey(view)] ?? [] : []

  return (
    <div className="app">
      <Sidebar
        currentUser={currentUser}
        groups={myGroups}
        dmPartners={dmPartners}
        activeView={view}
        onSelectGroup={(id) => setView({ kind: 'group', groupId: id })}
        onSelectDM={(id) => setView({ kind: 'dm', otherUserId: id })}
        onCreateGroup={() => setModal({ type: 'createGroup' })}
        onJoinGroup={() => setModal({ type: 'joinGroup' })}
        onNewDM={() => setModal({ type: 'newDM' })}
        onLogout={handleLogout}
        presenceVersion={presenceVersion}
        onOpenAbout={() => setInfoModal('about')}
        onOpenPrivacy={() => setInfoModal('privacy')}
      />

      <main className="main">
        {view ? (
          <ChatView
            currentUser={currentUser}
            kind={view.kind}
            group={activeGroup}
            dmUser={activeDMUser}
            messages={plaintextFromStoredMessages(plaintext, view, currentUser.id)}
            typingUsers={typingForView}
            onSelfTyping={onSelfTyping}
            viewKeyForTyping={view ? viewKeyOf(view.kind, view.kind === 'dm' ? view.otherUserId : view.groupId) : null}
            onSend={(text) => {
              void handleSend(text)
            }}
            onLeaveGroup={view.kind === 'group' ? handleLeaveGroup : undefined}
          />
        ) : (
          <WelcomeScreen
            currentUser={currentUser}
            groups={myGroups}
            dmPartners={dmPartners}
            messagesSent={messagesSent}
            onCreateGroup={() => setModal({ type: 'createGroup' })}
            onJoinGroup={() => setModal({ type: 'joinGroup' })}
            onNewDM={() => setModal({ type: 'newDM' })}
            onOpenAbout={() => setInfoModal('about')}
            onOpenPrivacy={() => setInfoModal('privacy')}
          />
        )}
      </main>

      {modal?.type === 'createGroup' && (
        <Modal title="Create a group" onClose={() => setModal(null)}>
          <CreateGroupForm
            onCancel={() => setModal(null)}
            onSubmit={(name, desc) => handleCreateGroup(name, desc)}
          />
        </Modal>
      )}
      {modal?.type === 'joinGroup' && (
        <Modal title="Join a group" onClose={() => setModal(null)}>
          <JoinGroupForm
            onCancel={() => setModal(null)}
            onSubmit={(code) => handleJoinGroup(code)}
          />
        </Modal>
      )}
      {modal?.type === 'newDM' && (
        <Modal title="Start a direct message" onClose={() => setModal(null)}>
          <NewDMForm
            currentUsername={currentUser.username}
            knownUsers={Users.all().filter((u) => u.id !== currentUser.id)}
            onCancel={() => setModal(null)}
            onSubmit={(uname) => handleStartDM(uname)}
          />
        </Modal>
      )}
      {modal?.type === 'created' && (
        <Modal title="Group created" onClose={() => setModal(null)}>
          <CreatedSuccess
            name={modal.name}
            code={modal.code}
            onDone={() => setModal(null)}
          />
        </Modal>
      )}

      {toast && (
        <Toast kind={toast.kind}>{toast.text}</Toast>
      )}

      {infoModal === 'about' && (
        <AboutModal onClose={() => setInfoModal(null)} />
      )}
      {infoModal === 'privacy' && (
        <PrivacyModal onClose={() => setInfoModal(null)} />
      )}
    </div>
  )
}

/**
 * Convert stored Messages into a NEW list with `text` populated from the
 * in-memory plaintext cache. Memory only — never written back.
 */
function plaintextFromStoredMessages(
  cache: PlaintextMap,
  view: View,
  selfId: UserId,
): (Message & { text: string })[] {
  const list =
    view.kind === 'dm'
      ? Messages.dmBetween(selfId, view.otherUserId)
      : Messages.forGroup(view.groupId)
  return list.map((m) => ({ ...m, text: cache.get(m.id) ?? '🔒' }))
}

/* ---------- small inline forms ---------- */

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: React.ReactNode
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err">{error}</div>}
    </label>
  )
}

function CreateGroupForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (
    name: string,
    desc: string,
  ) => Promise<{ ok: true; code: string } | { ok: false; error: string }>
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault()
        const r = await onSubmit(name, desc)
        if (!r.ok) setErr(r.error)
      }}
    >
      <Field label="Group name" error={err}>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (err) setErr(null)
          }}
          placeholder="e.g. Project Phoenix"
          maxLength={40}
          required
        />
      </Field>
      <Field label="Description (optional)">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What's this group about?"
          maxLength={120}
        />
      </Field>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Create
        </button>
      </div>
    </form>
  )
}

function JoinGroupForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (
    code: string,
  ) => Promise<{ ok: true; alreadyMember?: boolean } | { ok: false; error: string }>
}) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault()
        const r = await onSubmit(code)
        if (!r.ok) setErr(r.error)
      }}
    >
      <Field
        label="Group code"
        hint={<>Codes are 6 characters, letters &amp; numbers, globally unique.</>}
        error={err}
      >
        <input
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
            if (err) setErr(null)
          }}
          placeholder="K7P3QX"
          maxLength={6}
          spellCheck={false}
          autoCapitalize="characters"
          autoCorrect="off"
          required
          className="mono wide"
        />
      </Field>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Join
        </button>
      </div>
    </form>
  )
}

function NewDMForm({
  currentUsername,
  knownUsers,
  onCancel,
  onSubmit,
}: {
  currentUsername: string
  knownUsers: User[]
  onCancel: () => void
  onSubmit: (
    username: string,
  ) => { ok: true } | { ok: false; error: string }
}) {
  const [u, setU] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const suggestions = useMemo(() => {
    const lc = u.trim().toLowerCase()
    if (!lc) return knownUsers.slice(0, 5)
    return knownUsers
      .filter(
        (x) =>
          x.username.toLowerCase().includes(lc) ||
          x.displayName.toLowerCase().includes(lc),
      )
      .slice(0, 5)
  }, [u, knownUsers])
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        const r = onSubmit(u)
        if (!r.ok) setErr(r.error)
      }}
    >
      <Field
        label="Recipient username"
        hint={
          <>
            You're signed in as <b>@{currentUsername}</b>. Pick someone below or
            type a username.
          </>
        }
        error={err}
      >
        <input
          autoFocus
          value={u}
          onChange={(e) => {
            setU(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
            if (err) setErr(null)
          }}
          placeholder="their username"
          maxLength={20}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
      </Field>
      {suggestions.length > 0 && (
        <div className="suggest-list" role="listbox" aria-label="Matching users">
          {suggestions.map((s) => (
            <button
              type="button"
              key={s.id}
              role="option"
              aria-selected={u === s.username}
              className={'suggest-row' + (u === s.username ? ' active' : '')}
              onClick={() => setU(s.username)}
            >
              <span className="suggest-name">{s.displayName}</span>
              <span className="suggest-handle">@{s.username}</span>
            </button>
          ))}
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={!u}>
          Start chat
        </button>
      </div>
    </form>
  )
}

function CreatedSuccess({
  name,
  code,
  onDone,
}: {
  name: string
  code: string
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy group code:', code)
    }
  }
  return (
    <div className="created-success">
      <div className="created-emoji" aria-hidden="true">
        🎉
      </div>
      <h3 className="created-title">{name} is ready</h3>
      <p className="created-sub">
        Share this 6-character code so others can join:
      </p>
      <div className="created-code-row">
        <code className="created-code mono">{code}</code>
        <button className="btn ghost" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div className="form-actions">
        <button className="btn primary block" onClick={onDone}>
          Open group
        </button>
      </div>
    </div>
  )
}
