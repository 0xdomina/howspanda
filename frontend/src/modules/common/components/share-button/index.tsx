"use client"

import { useCallback, useState } from "react"

import ShareSheet from "@modules/common/components/share-sheet"
import Share from "@modules/common/icons/share"
import { SharePayload, ShareResult } from "@lib/share"

type ShareButtonProps = {
  payload: SharePayload
  entity: string
  entityId?: string
  label?: string
  className?: string
}

/**
 * Universal Share control. Present on every screen that contains a
 * shareable entity. Purely the affordance icon; text is the tooltip.
 */
const ShareButton = ({
  payload,
  entity,
  entityId,
  label,
  className,
}: ShareButtonProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={label ?? "Share"}
        className={
          className ??
          "flex h-10 w-10 items-center justify-center rounded-control border border-ink-hairline text-ink transition-colors duration-fast hover:bg-paper-tinted hover:text-ink active:scale-[0.96]"
        }
      >
        <Share size={18} />
      </button>
      <ShareSheet
        isOpen={isOpen}
        close={close}
        payload={payload}
        entity={entity}
        entityId={entityId}
        onShared={(result: ShareResult) => {
          if (result.status === "copy") {
            /* toast handled inside sheet */
          }
        }}
      />
    </>
  )
}

export default ShareButton
