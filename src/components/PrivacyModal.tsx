import Modal from './Modal'
import { APP_NAME, CREATOR_NAME } from '../constants'

/**
 * Privacy-modal — the spec asks for "a dedicated /privacy page in plain
 * English. No 8,000-word legal wall." Without a router installed we use the
 * existing accessible Modal as the surface; the content itself matches the
 * spec's intent (short, scannable, no legalese).
 */
export function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Privacy" onClose={onClose}>
      <article className="info-modal" aria-label="Privacy notice">
        <p className="info-modal-lede">
          The short, honest version of how {APP_NAME} handles your data.
          {' '}Written by {CREATOR_NAME} and kept in plain English.
        </p>

        <h4>What we never see</h4>
        <ul>
          <li>Your message contents. They are end-to-end encrypted before they leave your device.</li>
          <li>Your private key. It never leaves your browser and is wrapped with your password.</li>
          <li>Group keys — wrapped per member, derived from group secrets.</li>
        </ul>

        <h4>What we do store</h4>
        <ul>
          <li>Your username, display name, and public key — so others can find you.</li>
          <li>Encrypted ciphertext envelopes of messages for groups you're in.</li>
          <li>Local presence signals (typing + last-seen) shared across tabs on the same device.</li>
        </ul>

        <h4>What we don't do</h4>
        <ul>
          <li>No advertising.</li>
          <li>No third-party tracking.</li>
          <li>
            No message-content analytics. Anonymous event counters only —
            never the content itself, and never your file names.
          </li>
        </ul>

        <p className="info-modal-foot">
          The full source and audit trail are public. If you find a
          discrepancy, please report it via the creator's profile.
        </p>
      </article>
    </Modal>
  )
}
