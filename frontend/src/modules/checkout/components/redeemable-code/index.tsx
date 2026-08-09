"use client"

import { applyRedeemable } from "@lib/data/cart"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { useState, useTransition } from "react"

type RedeemableCodeProps = { cart: HttpTypes.StoreCart }

const RedeemableCode = ({ cart }: RedeemableCodeProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const metadata = cart.metadata as Record<string, unknown> | null | undefined
  const appliedCode = metadata?.redeemable_code
  const appliedAmount = metadata?.redeemable_amount

  const submit = () => {
    setError(null)
    if (code.trim().length < 6) {
      setError("Enter the full store code.")
      return
    }

    startTransition(async () => {
      try {
        const result = await applyRedeemable(code)
        if (!result.success) {
          setError(result.error ?? "That code could not be applied.")
          return
        }
        window.location.reload()
      } catch (submissionError: any) {
        setError(submissionError?.message ?? "That code could not be applied.")
      }
    })
  }

  if (appliedCode) {
    return (
      <div className="rounded-control border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" data-testid="redeemable-applied">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">Store code applied</p>
            <p className="mt-1 text-xs text-emerald-800/80">
              <span className="font-mono">{String(appliedCode)}</span>
              {appliedAmount
                ? ` · ${convertToLocale({ amount: Number(appliedAmount), currency_code: cart.currency_code })} saved`
                : ""}
            </p>
          </div>
          <span aria-hidden="true">✓</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full" data-testid="redeemable-code">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="text-sm font-medium text-ink underline-offset-4 hover:underline"
      >
        Have a gift card or store code?
      </button>
      {isOpen && (
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-5 text-ink-muted">
            Gift cards and vouchers apply to this store&apos;s items. Tickets are shown at the venue.
          </p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => { if (event.key === "Enter") submit() }}
              placeholder="GC-XXXX-XXXX-XXXX"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-control border border-ink-hairline bg-white px-3 py-2 font-mono text-sm text-ink outline-none focus:border-ink"
              data-testid="redeemable-code-input"
            />
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="rounded-control bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              data-testid="redeemable-apply-button"
            >
              {isPending ? "Applying…" : "Apply"}
            </button>
          </div>
          {error && <p className="text-sm text-rose-600" data-testid="redeemable-error">{error}</p>}
        </div>
      )}
    </div>
  )
}

export default RedeemableCode
