"use client"

import { clx } from "@medusajs/ui"
import { useCallback, useState } from "react"

import Modal from "@modules/common/components/modal"
import MoneyText from "@modules/common/components/money-text"

type RefundActionProps = {
  refundableAmount: number
  currencyCode: string
  onRequestRefund: (reason: string) => Promise<void>
  className?: string
}

const REASONS = [
  "Item not received",
  "Item not as described",
  "Damaged on delivery",
  "Ordered by mistake",
]

/**
 * The refund affordance. No money-mechanics copy: the action exists when
 * the window is open; the consequence is stated only on the confirm step.
 */
const RefundAction = ({
  refundableAmount,
  currencyCode,
  onRequestRefund,
  className,
}: RefundActionProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const open = () => setIsOpen(true)
  const close = () => {
    if (!submitting) setIsOpen(false)
  }

  const submit = useCallback(async () => {
    if (!reason) return
    setSubmitting(true)
    try {
      await onRequestRefund(reason)
      setDone(true)
    } finally {
      setSubmitting(false)
    }
  }, [reason, onRequestRefund])

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={clx(
          "text-sm font-medium text-ink-muted underline-offset-4 transition-colors duration-fast hover:text-ink hover:underline",
          className
        )}
      >
        Request refund
      </button>

      <Modal isOpen={isOpen} close={close} size="small">
        <Modal.Title>
          {done ? "Refund requested" : "Request refund"}
        </Modal.Title>
        {done ? (
          <Modal.Body>
            <div className="flex w-full flex-col items-center gap-3 py-6">
              <p className="text-center text-base text-ink">
                <MoneyText amount={refundableAmount} currency_code={currencyCode} className="font-semibold" />
                {" refunded to your wallet"}
              </p>
              <p className="text-center text-sm text-ink-muted">
                You will see it in your wallet shortly.
              </p>
              <button
                type="button"
                onClick={close}
                className="mt-2 rounded-control bg-ink px-6 py-2.5 text-sm font-medium text-paper-surface transition-transform duration-fast hover:bg-ink/90 active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </Modal.Body>
        ) : (
          <>
            <Modal.Description>
              <span className="text-ink-muted">Pick a reason for your request.</span>
            </Modal.Description>
            <Modal.Body>
              <div className="flex w-full flex-col gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={clx(
                      "rounded-control border px-4 py-3 text-left text-sm transition-colors duration-fast",
                      reason === r
                        ? "border-ink bg-paper-tinted font-medium text-ink"
                        : "border-ink-hairline text-ink hover:bg-paper-tinted"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <div className="mt-6 flex w-full gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={submitting}
                  className="flex-1 rounded-control border border-ink-hairline py-2.5 text-sm font-medium text-ink transition-colors duration-fast hover:bg-paper-tinted disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!reason || submitting}
                  className="flex-1 rounded-control bg-ink py-2.5 text-sm font-medium text-paper-surface transition-transform duration-fast hover:bg-ink/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? "Requesting" : "Request refund"}
                </button>
              </div>
            </Modal.Footer>
          </>
        )}
      </Modal>
    </>
  )
}

export default RefundAction
