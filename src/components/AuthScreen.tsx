import { useState, type FormEvent } from 'react'
import { BrandFooter } from './BrandFooter'
import { AboutModal } from './AboutModal'
import { PrivacyModal } from './PrivacyModal'

export default function AuthScreen({
  onRegister,
  onLogin,
}: {
  onRegister: (
    username: string,
    displayName: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  onLogin: (
    username: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Local About/Privacy overlays so the brand-footer links work even on the
  // unauthenticated screen, where App.tsx's modals aren't rendered.
  const [infoModal, setInfoModal] = useState<'about' | 'privacy' | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const r =
        mode === 'register'
          ? await onRegister(username, displayName, password)
          : await onLogin(username, password)
      if (!r.ok) setErr(r.error)
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next)
    setErr(null)
    setShowPassword(false)
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <div className="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="38" height="38">
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#a390ff" />
                  <stop offset="100%" stopColor="#5b3df5" />
                </linearGradient>
              </defs>
              <rect width="32" height="32" rx="9" fill="url(#g1)" />
              <path
                d="M9 12h14v9H13l-4 4z"
                fill="white"
                opacity="0.95"
              />
            </svg>
          </div>
          <div>
            <h1>CipherChat</h1>
            <p>
              {mode === 'register'
                ? 'Create an account to start messaging.'
                : 'Sign in to continue.'}
            </p>
          </div>
        </div>

        <div className="trust-row" role="list" aria-label="Security guarantees">
          <div className="trust-chip" role="listitem">
            <span className="trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <div>
              <div className="trust-title">ECDH P-256</div>
              <div className="trust-sub">Keys derived per session</div>
            </div>
          </div>
          <div className="trust-chip" role="listitem">
            <span className="trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
              </svg>
            </span>
            <div>
              <div className="trust-title">AES-256-GCM</div>
              <div className="trust-sub">Authenticated seal</div>
            </div>
          </div>
          <div className="trust-chip" role="listitem">
            <span className="trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="9" r="4" />
                <path d="M3 21a6 6 0 0 1 12 0" />
                <path d="M17 11l2 2 4-4" />
              </svg>
            </span>
            <div>
              <div className="trust-title">Zero-knowledge</div>
              <div className="trust-sub">Only contacts read your chats</div>
            </div>
          </div>
        </div>

        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'tab active' : 'tab'}
            onClick={() => switchMode('register')}
            type="button"
          >
            Create account
          </button>
          <button
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'tab active' : 'tab'}
            onClick={() => switchMode('login')}
            type="button"
          >
            Sign in
          </button>
        </div>

        <form className="form" onSubmit={submit} aria-busy={busy}>
          <label>
            Username
            <input
              autoFocus
              value={username}
              onChange={(e) =>
                setUsername(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                )
              }
              placeholder="cooluser42"
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              aria-invalid={!!err}
            />
          </label>

          {mode === 'register' && (
            <label>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Cool User"
                maxLength={40}
              />
            </label>
          )}

          <label className="with-trailing">
            Password
            <div className="password-row">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'at least 6 characters' : ''}
                minLength={mode === 'register' ? 6 : undefined}
                autoComplete={
                  mode === 'register' ? 'new-password' : 'current-password'
                }
                required
                aria-invalid={!!err}
              />
              <button
                type="button"
                className="ghost-tiny"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          {err && (
            <div className="err" role="alert">
              {err}
            </div>
          )}

          <button
            type="submit"
            className="btn primary block"
            disabled={busy}
          >
            {busy
              ? 'Working…'
              : mode === 'register'
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        <p className="fineprint">
          {mode === 'register'
            ? 'Usernames must be 3–20 chars (a–z, 0–9, _). Passwords are hashed (PBKDF2, salted) before storage.'
            : `Signed-in sessions are remembered until you sign out.`}
        </p>

        <BrandFooter
          variant="auth"
          onOpenAbout={() => setInfoModal('about')}
          onOpenPrivacy={() => setInfoModal('privacy')}
        />
      </div>

      {infoModal === 'about' && (
        <AboutModal onClose={() => setInfoModal(null)} />
      )}
      {infoModal === 'privacy' && (
        <PrivacyModal onClose={() => setInfoModal(null)} />
      )}
    </div>
  )
}
