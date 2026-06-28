/**
 * Outgoing-message delivery indicator. Pure-presentation. The App/ChatView
 * tracks lifecycle: 'sending' is shown briefly during async encryption;
 * 'sent' once the ciphertext is committed to localStorage; 'delivered'
 * would require a real backend, so it stays 'sent' in this demo.
 */
export type DeliveryStatus = 'sending' | 'sent' | 'delivered'

export function MessageStatus({ status }: { status: DeliveryStatus }) {
  const title =
    status === 'sending'
      ? 'Encrypting…'
      : status === 'sent'
        ? 'Sent'
        : 'Delivered'
  return (
    <span
      className={`msg-status ${status}`}
      title={title}
      aria-label={title}
      data-status={status}
    >
      {status === 'sending' ? (
        <Spinner />
      ) : (
        <>
          <Check />
          {status === 'delivered' && <Check />}
        </>
      )}
    </span>
  )
}

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
      className="msg-spinner"
    >
      <circle cx="12" cy="12" r="9" opacity="0.35" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  )
}
