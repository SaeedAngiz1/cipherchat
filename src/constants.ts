/**
 * App-wide constants for brand, creator credit, and footer text.
 *
 * Kept in one place so:
 *   - index.html meta tags, the App shell, About/Privacy modals, and the
 *     BrandFooter can never drift out of sync.
 *   - A future rename (e.g. pivoting from CipherChat to Omni Converter) is
 *     a single-file change rather than a string hunt.
 */

export const APP_NAME = 'CipherChat'
export const APP_TAGLINE = 'Secure messaging, end-to-end encrypted.'
export const APP_DESCRIPTION =
  'CipherChat is a small, privacy-first messager with end-to-end encryption. ' +
  'No tracking on message contents, keys live in your browser only, and ' +
  'conversations stay between the people in them.'

export const CREATOR_NAME = 'Mohammad Saeed Angiz'
export const CREATOR_URL = 'https://github.com/' // Replace with the creator's real profile link.
export const CREATED_BY_LINE = `${APP_NAME} — Created by ${CREATOR_NAME}.`
export const AUTHOR_META = CREATOR_NAME
export const KEYWORDS_META =
  'cipherchat, encrypted chat, e2e messaging, privacy, secure messaging, mohammad saeed angiz'
