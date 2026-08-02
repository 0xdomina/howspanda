import { clx } from "@medusajs/ui"

type ChipProps = {
  label: string
  selected?: boolean
  onClick?: () => void
  className?: string
}

/**
 * Filter/tag chip. The pill radius is reserved for these affordances.
 * Selection is shown by fill + weight, never by color alone.
 */
const Chip = ({ label, selected = false, onClick, className }: ChipProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clx(
        "inline-flex items-center whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-fast",
        selected
          ? "border-ink bg-ink text-paper-surface"
          : "border-ink-hairline bg-paper-surface text-ink hover:bg-paper-tinted",
        className
      )}
    >
      {label}
    </button>
  )
}

export default Chip