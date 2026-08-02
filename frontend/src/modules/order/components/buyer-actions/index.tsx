"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { convertToLocale } from "@lib/util/money"
import Button from "@modules/common/components/button"
import {
  cancelOrderReturn,
  confirmOrderReceipt,
  createOrderReview,
  requestOrderReturn,
  retrieveOrderEscrow,
  tipSeller,
  type EscrowStatus,
} from "@lib/data/order-buyer"
import ErrorMessage from "@modules/checkout/components/error-message"

const inputClass =
  "px-3 py-2 text-sm border border-ink-hairline rounded-control bg-paper focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active"

const labelClass = "text-sm font-medium text-ink"

export default function BuyerOrderActions({
  orderId,
  email: knownEmail,
}: {
  orderId: string
  email: string
}) {
  const router = useRouter()
  const [email, setEmail] = useState(knownEmail ?? "")
  const [status, setStatus] = useState<EscrowStatus | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [returnReason, setReturnReason] = useState("")
  const [tipAmount, setTipAmount] = useState("")
  const [tipNote, setTipNote] = useState("")
  const [rating, setRating] = useState("5")
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()

  const refresh = (message: string | null = null) => {
    if (message) setOk(message)
    setError(null)
    startTransition(async () => {
      const result = await retrieveOrderEscrow(orderId, email)
      if ("success" in result) {
        setError(result.error)
        return
      }
      setStatus(result)
      router.refresh()
    })
  }

  const unlock = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await retrieveOrderEscrow(orderId, email)
      if ("success" in result) {
        setError(result.error)
        return
      }
      setStatus(result)
      setUnlocked(true)
    })
  }

  const pending = status?.lines.filter((l) => l.status === "pending") ?? []
  const held = pending.filter((l) => l.held_at) ?? []
  const open = pending.filter((l) => !l.held_at && !l.confirmed_at) ?? []
  const released = status?.lines.filter((l) => l.status !== "pending") ?? []
  const anyDelivered = status?.lines.some((l) => l.delivered_at) ?? false
  const multiSeller = new Set(
    status?.lines.map((l) => l.seller_id).filter(Boolean)
  ).size > 1
  const totalHeld = open.reduce((s, l) => s + Number(l.net_amount), 0)

  return (
    <div
      className="flex flex-col gap-y-4 border border-ink-hairline rounded-large p-6 bg-paper-surface"
      data-testid="buyer-order-actions"
    >
      <div>
        <h3 className="font-display text-lg font-medium tracking-[-0.02em] text-ink">
          Money &amp; feedback
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          Payment is held in escrow until you confirm you received your order.
        </p>
      </div>

      {!unlocked ? (
        <form onSubmit={unlock} className="flex flex-col gap-y-3">
          <div>
            <label className={labelClass}>Your checkout email</label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={`mt-1 block w-full ${inputClass}`}
              data-testid="buyer-email-input"
            />
          </div>
          <div>
            <Button
              size="base"
              isLoading={isPending}
              className="w-fit"
              data-testid="buyer-unlock"
            >
              View order money
            </Button>
          </div>
          <ErrorMessage error={error} data-testid="buyer-email-error" />
        </form>
      ) : (
        <div className="flex flex-col gap-y-5">
          {totalHeld > 0 && (
            <div className="flex flex-col gap-y-3">
              <p className="text-sm text-ink-muted">
                {open.length > 1 ? "Stores are owed" : "The store is owed"}{" "}
                <span className="font-mono tabular-nums text-ink">
                  {convertToLocale({
                    amount: totalHeld,
                    currency_code: "ngn",
                  })}
                </span>{" "}
                until you confirm delivery.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="base"
                  isLoading={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await confirmOrderReceipt(orderId, email)
                      r.success
                        ? refresh("Thanks — the store has been paid.")
                        : setError(r.error)
                    })
                  }
                  data-testid="confirm-receipt-button"
                >
                  I received my order
                </Button>

                {!anyDelivered && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className={`w-56 ${inputClass}`}
                      data-testid="return-reason-input"
                    />
                    <Button
                      size="base"
                      variant="ghost"
                      isLoading={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await requestOrderReturn(
                            orderId,
                            email,
                            returnReason || "buyer requested cancel"
                          )
                          r.success
                            ? refresh(
                                "Return requested — payment is on hold."
                              )
                            : setError(r.error)
                        })
                      }
                      data-testid="request-return-button"
                    >
                      Cancel or return
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {held.length > 0 && (
            <div className="flex flex-col gap-y-2 border border-ink-hairline rounded-large p-4 bg-paper">
              <p className="text-sm font-medium text-ink">Return in progress</p>
              {held.map((l) => (
                <p key={l.id} className="text-sm text-ink-muted">
                  {l.hold_reason ?? "Return requested"} — payment is held until
                  this resolves.
                </p>
              ))}
              <div>
                <Button
                  size="base"
                  variant="ghost"
                  isLoading={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await cancelOrderReturn(orderId, email)
                      r.success
                        ? refresh(
                            "Return cancelled — the original release schedule resumes."
                          )
                        : setError(r.error)
                    })
                  }
                  data-testid="cancel-return-button"
                >
                  Cancel return request
                </Button>
              </div>
            </div>
          )}

          {released.length > 0 && totalHeld === 0 && (
            <p className="text-sm text-ink-muted" data-testid="escrow-released">
              This payment has been released to the store.
            </p>
          )}

          <div className="border-t border-ink-hairline pt-5 flex flex-col gap-y-3">
            <label className={labelClass}>Send a tip</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="1"
                step="any"
                inputMode="decimal"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                placeholder="Amount (NGN)"
                className={`w-36 ${inputClass}`}
                data-testid="tip-amount-input"
              />
              <input
                type="text"
                value={tipNote}
                onChange={(e) => setTipNote(e.target.value)}
                placeholder="Note (optional)"
                className={`flex-1 min-w-[160px] ${inputClass}`}
                data-testid="tip-note-input"
              />
              <Button
                size="base"
                isLoading={isPending}
                disabled={!tipAmount}
                onClick={() =>
                  startTransition(async () => {
                    const r = await tipSeller(
                      orderId,
                      email,
                      Number(tipAmount),
                      tipNote
                    )
                    if (r.success) {
                      setTipAmount("")
                      setTipNote("")
                      refresh("Tip sent — thank you!")
                    } else {
                      setError(r.error)
                    }
                  })
                }
                data-testid="tip-submit"
              >
                Send tip
              </Button>
            </div>
          </div>

          {!multiSeller ? (
            <div className="border-t border-ink-hairline pt-5 flex flex-col gap-y-3">
              <label className={labelClass}>Review this order</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="5"
                  step="1"
                  inputMode="numeric"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  className={`w-20 ${inputClass}`}
                  data-testid="rating-input"
                />
                <span className="text-sm text-ink-muted">/ 5</span>
              </div>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="How was the product? (optional)"
                className={`block w-full ${inputClass}`}
                data-testid="review-comment-input"
              />
              <div>
                <Button
                  size="base"
                  isLoading={isPending}
                  disabled={!rating}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await createOrderReview(
                        orderId,
                        email,
                        Number(rating),
                        comment
                      )
                      if (r.success) {
                        setComment("")
                        refresh("Thanks for your review!")
                      } else {
                        setError(r.error)
                      }
                    })
                  }
                  data-testid="review-submit"
                >
                  Submit review
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              This order has items from multiple stores — review each store&apos;s
              order from your account.
            </p>
          )}

          <ErrorMessage error={error} data-testid="buyer-action-error" />
          {ok && (
            <p className="text-sm text-ink" data-testid="buyer-action-ok">
              {ok}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
