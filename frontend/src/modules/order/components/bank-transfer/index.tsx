"use client"

import { useCallback, useEffect, useState, useTransition } from "react"

import {
  retrieveBankTransfer,
  submitBankProof,
  uploadBankProofImage,
  type BankTransferTransfer,
} from "@lib/data/bank-transfer"
import { convertToLocale } from "@lib/util/money"
import Button from "@modules/common/components/button"
import ErrorMessage from "@modules/checkout/components/error-message"

const inputClass =
  "px-3 py-2 text-sm border border-ink-hairline rounded-control bg-paper focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active"

const labelClass = "text-sm font-medium text-ink"

const STATUS_TITLE: Record<string, string> = {
  awaiting_proof: "Complete your bank transfer",
  submitted: "Proof submitted — awaiting the store's confirmation",
  confirmed: "Payment confirmed",
  rejected: "The store couldn't find your transfer",
  expired: "This order was closed — payment not confirmed",
}

const STATUS_BODY: Record<string, string> = {
  awaiting_proof:
    "Transfer the amount below to the store's bank account and include the reference in the narration. Then upload your transfer screenshot as proof.",
  submitted:
    "The store will check their account and confirm the payment. Transfers can take a while to arrive — if they reject, you can still fix it.",
  confirmed:
    "The store confirmed your transfer. You'll get a notification when your order ships.",
  expired:
    "The store could not confirm your transfer before the recheck window closed, so the order was cancelled. If you did transfer, contact the store directly to arrange a refund.",
}

export default function BankTransferCard({
  orderId,
  email,
  orderTotal = 0,
  currencyCode = "ngn",
  backendUrl = "",
}: {
  orderId: string
  email: string
  orderTotal?: number
  currencyCode?: string
  backendUrl?: string
}) {
  const [transfer, setTransfer] = useState<BankTransferTransfer | null>(null)
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [file, setFile] = useState<File | null>(null)
  const [proofUrl, setProofUrl] = useState("")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const load = useCallback(() => {
    startTransition(async () => {
      setError(null)
      const res = await retrieveBankTransfer(orderId, email)
      if ("success" in res) {
        if (/not paid by bank transfer/i.test(res.error)) {
          setHidden(true)
        } else {
          setError(res.error)
        }
        return
      }
      if (!res.transfers?.length) {
        setHidden(true)
        return
      }
      setTransfer(res.transfers[0])
    })
  }, [orderId, email])

  useEffect(() => {
    load()
  }, [load])

  const handleUpload = async (f: File) => {
    setUploadError(null)
    setOk(null)
    const res = await uploadBankProofImage(f)
    if (res.error) {
      setUploadError(res.error)
      setFile(null)
      setProofUrl("")
      return
    }
    setFile(f)
    setProofUrl(res.url ?? "")
  }

  const handleSubmit = () => {
    setSubmitError(null)
    setOk(null)
    if (!transfer) return
    if (!proofUrl) {
      setSubmitError("Upload a screenshot of your transfer as proof.")
      return
    }
    startTransition(async () => {
      const res = await submitBankProof(orderId, {
        email,
        reference: transfer.reference,
        proof_url: proofUrl,
        amount: amount ? Number(amount) : undefined,
        note: note || undefined,
      })
      if (!res.success) {
        setSubmitError(res.error)
        return
      }
      setFile(null)
      setProofUrl("")
      setAmount("")
      setNote("")
      setOk("Proof submitted — the store will confirm shortly.")
      load()
    })
  }

  if (hidden) {
    return null
  }

  const fmt = (n: number | null | undefined) =>
    convertToLocale({ amount: Number(n ?? 0), currency_code: currencyCode })

  const deadline = transfer?.recheck_until
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(transfer.recheck_until))
    : null

  const canSubmit =
    transfer?.status === "awaiting_proof" || transfer?.status === "rejected"

  return (
    <div
      className="flex flex-col gap-y-4 border border-ink-hairline rounded-large p-6 bg-paper-surface"
      data-testid="bank-transfer-card"
    >
      <div>
        <h3 className="font-display text-lg font-medium tracking-[-0.02em] text-ink">
          {transfer ? STATUS_TITLE[transfer.status] : "Bank transfer"}
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          {transfer ? STATUS_BODY[transfer.status] : "Loading…"}
        </p>
      </div>

      {error && (
        <ErrorMessage
          error={error}
          data-testid="bank-transfer-load-error"
        />
      )}

      {transfer && (
        <div className="flex flex-col gap-y-4">
          <div className="grid grid-cols-1 small:grid-cols-2 gap-3 rounded-control border border-ink-hairline p-4 bg-paper">
            <div>
              <p className={labelClass}>Transfer to</p>
              <p className="mt-1 text-ink font-medium">
                {transfer.bank?.account_name || "Store bank account"}
              </p>
              <p className="text-sm text-ink-muted">
                {transfer.bank?.bank_name} · {transfer.bank?.account_number}
              </p>
              {transfer.seller?.name && (
                <p className="text-xs text-ink-muted mt-1">
                  Store: {transfer.seller.name}
                </p>
              )}
            </div>
            <div>
              <p className={labelClass}>Amount to transfer</p>
              <p className="mt-1 text-ink font-mono tabular-nums">
                {fmt(orderTotal || transfer.amount)}
              </p>
              <p className="text-sm text-ink-muted">Use this exact amount.</p>
            </div>
          </div>

          <div className="rounded-control border border-ink-hairline p-4 bg-paper">
            <p className={labelClass}>Your payment reference</p>
            <p className="mt-1 text-ink font-mono tabular-nums tracking-wide">
              {transfer.reference}
            </p>
            <p className="text-sm text-ink-muted mt-1">
              Include it in the transfer narration so the store can match it.
            </p>
          </div>

          {canSubmit && (
            <div className="flex flex-col gap-y-3">
              <div>
                <label className={labelClass}>Transfer screenshot</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                  }}
                  className="mt-1 block w-full text-sm text-ink-muted file:mr-3 file:rounded-control file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
                  data-testid="bank-proof-file-input"
                />
                {uploadError && (
                  <p className="mt-1 text-xs text-rose-600">{uploadError}</p>
                )}
              </div>

              <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Amount sent (NGN)</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={String(orderTotal || "")}
                    className={`mt-1 block w-full ${inputClass}`}
                    data-testid="bank-proof-amount-input"
                  />
                </div>
                <div>
                  <label className={labelClass}>Note (optional)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything the store should know"
                    className={`mt-1 block w-full ${inputClass}`}
                    data-testid="bank-proof-note-input"
                  />
                </div>
              </div>

              <div>
                <Button
                  size="base"
                  isLoading={isPending}
                  disabled={!proofUrl}
                  onClick={handleSubmit}
                  data-testid="bank-proof-submit"
                >
                  I&apos;ve made this transfer
                </Button>
              </div>
              {submitError && (
                <ErrorMessage
                  error={submitError}
                  data-testid="bank-proof-error"
                />
              )}
              {ok && (
                <p
                  className="text-sm text-ink"
                  data-testid="bank-proof-ok"
                >
                  {ok}
                </p>
              )}
            </div>
          )}

          {transfer.status === "submitted" && transfer.proof_url && (
            <div>
              <p className={labelClass}>Your proof</p>
              <img
                src={`${backendUrl}${transfer.proof_url}`}
                alt="Your transfer proof"
                className="mt-2 max-h-64 w-auto rounded-control border border-ink-hairline"
                data-testid="bank-proof-image"
              />
            </div>
          )}

          {transfer.status === "rejected" && (
            <div className="flex flex-col gap-y-2 rounded-control border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-medium text-rose-800">
                The store couldn&apos;t find the transfer
              </p>
              {transfer.rejection_note && (
                <p className="text-sm text-rose-700">
                  Their note: “{transfer.rejection_note}”
                </p>
              )}
              {deadline && (
                <p className="text-sm text-rose-700">
                  Recheck window until {deadline} — if the money is still on its
                  way, it can still be confirmed. Otherwise re-upload your proof
                  above.
                </p>
              )}
            </div>
          )}

          {transfer.status === "confirmed" && (
            <p className="text-sm text-ink" data-testid="bank-proof-confirmed">
              The store confirmed your transfer. Fulfillment is underway.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
