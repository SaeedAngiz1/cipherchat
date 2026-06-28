import {
  APP_NAME,
  CREATED_BY_LINE,
  CREATOR_NAME,
  CREATOR_URL,
} from '../constants'

/**
 * Global brand footer — shows the required creator credit on every screen
 * and exposes About/Privacy triggers (which App.tsx routes to the
 * AboutModal / PrivacyModal overlays).
 *
 * Per brand requirements:
 *   - "Every page footer carries: <APP_NAME> — Created by <CREATOR_NAME>."
 *   - The credit links to the creator's profile, not buried in fine print.
 */
export function BrandFooter({
  variant = 'sidebar',
  onOpenAbout,
  onOpenPrivacy,
}: {
  /**
   * `sidebar`  — narrow, sits at the bottom of the conversation sidebar.
   * `welcome`  — wider, sits beneath the welcome-card grid; about/privacy
   *              are explicit links next to the credit.
   * `auth`     — centered beneath the auth card (unauthenticated screen).
   * All three keep the same "Created by" line so copy stays identical.
   */
  variant?: 'sidebar' | 'welcome' | 'auth'
  onOpenAbout: () => void
  onOpenPrivacy: () => void
}) {
  return (
    <footer
      className={`brand-footer brand-footer-${variant}`}
      role="contentinfo"
      aria-label="Site footer"
    >
      <div className="brand-footer-credit">
        {/* Screen-reader detour: announce the credit immediately so AT
            users hear the creator credit before reading the rest. */}
        <strong>{APP_NAME}</strong>
        <span className="brand-footer-sep" aria-hidden="true">
          —
        </span>
        <span>
          Created by{' '}
          <a
            href={CREATOR_URL}
            target="_blank"
            rel="noreferrer noopener"
            title={`${CREATOR_NAME} (opens in a new tab)`}
          >
            {CREATOR_NAME}
          </a>
          .
        </span>
      </div>

      <div className="brand-footer-links" aria-label="Footer links">
        <button
          type="button"
          className="brand-footer-link"
          onClick={onOpenAbout}
        >
          About
        </button>
        <span aria-hidden="true" className="brand-footer-dot">
          ·
        </span>
        <button
          type="button"
          className="brand-footer-link"
          onClick={onOpenPrivacy}
        >
          Privacy
        </button>
      </div>

      {/* Hidden full creator-credit line for screen-readers — same text as
          the spec's required footer line, kept verbatim. */}
      <span className="sr-only">{CREATED_BY_LINE}</span>
    </footer>
  )
}
