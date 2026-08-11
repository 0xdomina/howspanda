"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { confirmBankTransfer, rejectBankTransfer } from "@lib/data/seller"

const STATUS_LABEL: Record<string, string> = {
  submitted: "Waiting for you to confirm the transfer",
  rejected: "You rejected the proof — recheck window open",
  confirmed: "Transfer confirmed",
  expired: "Recheck window closed — order cancelled",
}

const SellerBankTransfer = ({
  order,
  backendUrl = "",
}: {
  order: any
  backendUrl?: string
}) => {
  const bt = order.bank_transfer
  const [isPending, startTransition] = useTransition()
  const [rejectNote, setRejectNote] = useState("")
  const [rejecting, setRejecting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const router = useRouter()

  if (!bt) return null
  if (bt.status !== "submitted" && bt.status !== "rejected") return null

  const run = (action: () => Promise<string | null>, successText: string) => {
    setMessage(null)
    setOk(null)
    startTransition(async () => {
      const error = await action()
      if (error) {
        setMessage(error)
      } else {
        setOk(successText)
        setRejecting(false)
        setRejectNote("")
        router.refresh()
      }
    })
  }

  return (
    <div
      className="mt-3 w-full border border-ink-hairline rounded-control bg-paper p-4"
      data-testid="seller-bank-transfer"
    >
      <div className="flex flex-col gap-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink">
              Bank transfer · {bt.reference}
            </p>
            <p className="text-xs text-ink-muted">
              {STATUS_LABEL[bt.status]} · Buyer: {bt.buyer_email ?? "—"}
            </p>
          </div>
          <p className="text-ink font-mono tabular-nums text-sm">
            {new Intl.NumberFormat("en-NG", {
              style: "currency",
              currency: "NGN",
            }).format(Number(bt.amount ?? 0))}
          </p>
        </div>

        {bt.note && (
          <p className="text-xs text-ink-muted">
            Buyer&apos;s note: “{bt.note}”
          </p>
        )}

        {bt.proof_url && (
          <img
            src={`${backendUrl}${bt.proof_url}`}
            alt="Buyer's transfer proof"
            className="max-h-56 w-auto rounded-control border border-ink-hairline"
            data-testid="seller-bank-proof-image"
          />
        )}

        {bt.status === "rejected" && bt.rejection_note && (
          <p className="text-xs text-rose-600">
            Your note: “{bt.rejection_note}” — the buyer can still fix this.
          </p>
        )}

        {bt.status === "rejected" && (
          <p className="text-xs text-ink-muted">
            If the transfer just landed now, confirm it to keep the order
            moving. Otherwise tell the buyer what&apos;s wrong below.
          </p>
        )}

        {bt.status === "submitted" && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(() => confirmBankTransfer(order.id), "Transfer confirmed.")
              }
              className="rounded-medium bg-ink px-4 py-1.5 text-sm font-medium text-white hover:opacity-80 disabled:opacity-50"
              data-testid="confirm-bank-proof"
            >
              {isPending ? "Confirming…" : "Confirm transfer"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setRejecting(true)}
              className="rounded-medium border border-ink-strong px-4 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
              data-testid="start-reject-bank-proof"
            >
              Can&apos;t find it
            </button>
          </div>
        )}

        {(bt.status === "rejected" || rejecting) && (
          <div className="flex flex-col gap-y-2">
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Tell the buyer why (e.g. wrong amount, or reference not found). Leave blank to just ask them to re-upload."
              rows={2}
              className="w-full rounded-control border border-ink-hairline bg-white px-3 py-2 text-sm focus:outline-none focus:shadow-borders-interactive-with-active"
              data-testid="reject-bank-proof-note"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => rejectBankTransfer(order.id, rejectNote),
                    "Rejected. The buyer can fix and re-upload before the recheck window closes."
                  )
                }
                className="rounded-medium bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:opacity-80 disabled:opacity-50"
                data-testid="submit-reject-bank-proof"
              >
                {isPending ? "Rejecting…" : "Reject and send note"}
              </button>
              {bt.status === "rejected" && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () => confirmBankTransfer(order.id),
                      "Transfer confirmed."
                    )
                  }
                  className="rounded-medium bg-ink px-4 py-1.5 text-sm font-medium text-white hover:opacity-80 disabled:opacity-50"
                  data-testid="confirm-bank-proof-after-reject"
                >
                  {isPending ? "Confirming…" : "Confirm (money landed)"}
                </button>
              )}
            </div>
          </div>
        )}

        {message && <p className="text-xs text-rose-600">{message}</p>}
        {ok && <p className="text-xs text-ink">{ok}</p>}
      </div>
    </div>
  )
}

export default SellerBankTransfer
