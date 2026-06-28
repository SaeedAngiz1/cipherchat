import Modal from './Modal'
import { APP_NAME, APP_TAGLINE, CREATOR_NAME } from '../constants'

/**
 * About-modal: the spec requires `/about` to lead with the creator credit
 * and a short, human line about who built it and why. We don't have a router
 * installed, so an overlay modal keeps the spec's intent intact without
 * adding a routing dependency.
 */
export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={`About ${APP_NAME}`} onClose={onClose}>
      <article className="info-modal" aria-label="About CipherChat">
        <p className="info-modal-lede">
          <strong>{APP_NAME}</strong> is a small, opinionated secure messenger.
          {' '}
          <span aria-label={CREATOR_NAME}>Created by {CREATOR_NAME}</span>.
        </p>
        <p className="info-modal-sub">{APP_TAGLINE}</p>

        <h4>What it does</h4>
        <ul>
          <li>Sends end-to-end encrypted messages — keys live in your browser only.</li>
          <li>Zero-knowledge: the server never sees your plaintext.</li>
          <li>Works in groups and direct messages, with on-device message keys.</li>
        </ul>

        <h4>What it doesn't (yet)</h4>
        <ul>
          <li>It's an early-stage project. Bugs happen — please report them.</li>
          <li>
            Conversations live on your device. If you wipe local storage, your
            message history is gone.
          </li>
        </ul>

        <h4>Why it exists</h4>
        <p className="info-modal-prose">
          Built by {CREATOR_NAME} as a privacy-first alternative to chat apps
          that read your messages. The bet is that strong crypto + a tiny,
          honest UI beats a feature-stuffed product that sells your data.
        </p>
      </article>
    </Modal>
  )
}
