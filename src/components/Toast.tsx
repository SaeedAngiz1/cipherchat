import type { ReactNode } from 'react'

export type ToastKind = 'success' | 'error' | 'warn' | 'info'

/**
 * Centered-bottom toast with icon + colored accent. Self-dismiss is the
 * caller's responsibility (the App owns the timeout).
 */
export function Toast({ kind, children }: { kind: ToastKind; children: ReactNode }) {
  return (
    <div className={`toast toast-${kind}`} role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden="true">
        {kind === 'success' && <CheckCircle />}
        {kind === 'error' && <AlertCircle />}
        {kind === 'warn' && <AlertTriangle />}
        {kind === 'info' && <Info />}
      </span>
      <span className="toast-text">{children}</span>
    </div>
  )
}

function CheckCircle() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="16 9 11 14 8 11" />
    </svg>
  )
}
function AlertCircle() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
    </svg>
  )
}
function AlertTriangle() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="14" />
      <circle cx="12" cy="17.5" r="0.6" fill="currentColor" />
    </svg>
  )
}
function Info() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <circle cx="12" cy="7.5" r="0.7" fill="currentColor" />
    </svg>
  )
}
