import { clx } from "@medusajs/ui"

type VerifiedBadgeProps = {
  className?: string
  label?: boolean
}

/**
 * The verified identity mark, earned through KYC. Never purchasable.
 * Accent dot so it is never confused with decorative chrome.
 */
const VerifiedBadge = ({ className, label = false }: VerifiedBadgeProps) => {
  return (
    <span
      className={clx(
        "inline-flex items-center gap-1 text-brand",
        className
      )}
      title="Verified"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 2.5l2.4 1.8 3.0-.3 1.1 2.8 2.8 1.1-.3 3.0 1.8 2.4-1.8 2.4.3 3.0-2.8 1.1-1.1 2.8-3.0-.3L12 21.5l-2.4-1.8-3.0.3-1.1-2.8-2.8-1.1.3-3.0L1.2 9.8l1.8-2.4-.3-3.0 2.8-1.1 1.1-2.8 3.0.3 2.4-1.8z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M8.7 12l2.2 2.2 4.4-4.6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label && <span className="text-xs font-medium">Verified</span>}
    </span>
  )
}

export default VerifiedBadge