import { useEffect, useRef } from 'react'

/**
 * Accessible modal dialog.
 *  - Closes on Escape, on backdrop click
 *  - Returns focus to the previously-focused element on close
 *  - Basic focus trap (Tab/Shift+Tab cycle within the dialog)
 *  - Locks background scroll while open
 *  - role="dialog" aria-modal="true"
 */
const FOCUSABLE_SEL =
  'a[href], button:not([disabled]), input:not([disabled]),' +
  ' textarea:not([disabled]), select:not([disabled]),' +
  ' [tabindex]:not([tabindex="-1"])'

export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus first focusable inside the card.
    requestAnimationFrame(() => {
      const card = cardRef.current
      if (!card) return
      const first = card.querySelector<HTMLElement>(FOCUSABLE_SEL)
      first?.focus()
    })

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const card = cardRef.current
      if (!card) return
      const focusables = Array.from(
        card.querySelectorAll<HTMLElement>(FOCUSABLE_SEL),
      ).filter((el) => !el.hasAttribute('disabled'))
      if (focusables.length === 0) {
        // No focusable children — keep focus on the dialog itself.
        e.preventDefault()
        card.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previousFocus.current?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        // close only when the click started on the backdrop itself
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={cardRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
