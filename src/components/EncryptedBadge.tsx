/**
 * Small end-to-end encryption badge shown in chat headers.
 * - DM: ECDH P-256 → AES-256-GCM.
 * - Group: per-group AES-256 key, wrapped per-member with ECDH.
 * Uses an inline lock SVG so we don't depend on an icon library.
 */
export function EncryptedBadge({ kind }: { kind: 'dm' | 'group' }) {
  const description =
    kind === 'dm'
      ? 'Direct messages are sealed with ECDH-derived AES-256-GCM. Only you and your contact can read them.'
      : 'Group messages are encrypted with a per-group AES key. The key is wrapped per-member with ECDH so only the group can read it.'
  return (
    <span
      className="encrypted-badge"
      title={description}
      role="note"
      aria-label="End-to-end encrypted"
    >
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>Encrypted</span>
    </span>
  )
}
