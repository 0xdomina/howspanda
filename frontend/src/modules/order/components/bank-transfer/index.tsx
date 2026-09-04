"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"

import {
  completeProofUpload,
  prepareProofUpload,
  retrieveBankTransfer,
  submitBankProof,
  type BankTransferTransfer,
} from "@lib/data/bank-transfer"
import { encodeProductImage } from "@lib/media/image"
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

const STEPS = ["Transfer", "Upload proof", "Store confirms"] as const

function CopyButton({ text, testid }: { text: string; testid: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          const ta = document.createElement("textarea")
          ta.value = text
          document.body.appendChild(ta)
          ta.select()
          document.execCommand("copy")
          ta.remove()
        }
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 1500)
      }}
      className="shrink-0 rounded-control border border-ink-hairline bg-white px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-ink hover:text-white active:scale-[0.97]"
      aria-live="polite"
      data-testid={testid}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  )
}

function Stepper({ status }: { status: string }) {
  const current =
    status === "awaiting_proof" ? 0 : status === "submitted" ? 2 : 3
  return (
    <ol
      className="flex items-center gap-1"
      aria-label="Transfer progress"
      data-testid="bank-transfer-steps"
    >
      {STEPS.map((label, i) => {
        const done = i < current || status === "confirmed"
        const active = i === current && status !== "confirmed"
        return (
          <li key={label} className="flex flex-1 items-center gap-1 last:flex-none">
            <span
              className={
                "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold " +
                (done
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "bg-ink text-white"
                    : "bg-ink/10 text-ink-muted")
              }
              aria-current={active ? "step" : undefined}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={
                "hidden text-xs sm:inline " +
                (done || active ? "font-medium text-ink" : "text-ink-muted")
              }
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={"mx-1 h-px flex-1 " + (done ? "bg-emerald-600" : "bg-ink/10")}
                aria-hidden="true"
              />
            )}
          </li>
        )
      })}
    </ol>
  )
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

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [proofUrl, setProofUrl] = useState("")
  const [progress, setProgress] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

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

  useEffect(
    () => () => {
      xhrRef.current?.abort()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const clearUpload = () => {
    xhrRef.current?.abort()
    xhrRef.current = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setProofUrl("")
    setProgress(null)
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleUpload = async (f: File) => {
    xhrRef.current?.abort()
    setUploadError(null)
    setOk(null)
    setProofUrl("")
    setProgress(0)
    setUploadingProof(true)
    try {
      let uploadFile = f
      let mime = f.type
      try {
        const prepared = await encodeProductImage(f)
        uploadFile = new File([prepared], `payment-proof-${Date.now()}.webp`, {
          type: prepared.type,
        })
        mime = prepared.type
      } catch {
        // Older browsers can still upload the original image; the server
        // performs the same byte and dimension checks on that fallback.
      }

      const prepared = await prepareProofUpload(mime, uploadFile.size)
      if ("error" in prepared) {
        setUploadError(prepared.error)
        setProgress(null)
        return
      }

      // XMLHttpRequest: the only way to get REAL byte-level upload progress.
      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            // Reserve the last 10% for server-side verification.
            setProgress(Math.round((e.loaded / e.total) * 90))
          }
        }
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve(prepared.key)
            : reject(new Error("Proof upload failed. Please try again."))
        xhr.onerror = () => reject(new Error("Network error during upload. Please try again."))
        xhr.onabort = () => reject(new Error("Upload cancelled."))
        xhr.open("PUT", prepared.uploadUrl)
        xhr.setRequestHeader("content-type", mime)
        xhr.send(uploadFile)
      })

      setProgress(95)
      const completed = await completeProofUpload({
        key: url,
        size: uploadFile.size,
        mime,
      })
      if (completed.error || !completed.url) {
        setUploadError(completed.error ?? "Proof upload could not be verified.")
        setProgress(null)
        return
      }
      setProgress(100)
      setProofUrl(completed.url)
      setPreviewUrl(URL.createObjectURL(f))
    } catch (e: any) {
      if (e?.message !== "Upload cancelled.") {
        setUploadError(e?.message ?? "Upload failed.")
      }
      setProgress(null)
    } finally {
      xhrRef.current = null
      setUploadingProof(false)
    }
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
      clearUpload()
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

  const expectedAmount = Number(orderTotal || transfer?.amount || 0)
  const enteredAmount = amount.trim() === "" ? null : Number(amount)
  const amountMatch =
    enteredAmount === null || !Number.isFinite(enteredAmount)
      ? null
      : Math.abs(enteredAmount - expectedAmount) < 0.005

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

      {transfer && <Stepper status={transfer.status} />}

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
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-sm text-ink-muted">
                  {transfer.bank?.bank_name} ·{" "}
                  <span className="font-mono tabular-nums text-ink">
                    {transfer.bank?.account_number}
                  </span>
                </p>
                {transfer.bank?.account_number && (
                  <CopyButton
                    text={transfer.bank.account_number}
                    testid="copy-account-number"
                  />
                )}
              </div>
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
              <p className="text-sm text-ink-muted">
                Transfer this exact amount — mismatches slow confirmation.
              </p>
            </div>
          </div>

          <div className="rounded-control border border-ink-hairline p-4 bg-paper">
            <p className={labelClass}>Your payment reference</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-ink font-mono tabular-nums tracking-wide">
                {transfer.reference}
              </p>
              <CopyButton text={transfer.reference} testid="copy-reference" />
            </div>
            <p className="text-sm text-ink-muted mt-1">
              Include it in the transfer narration so the store can match it.
            </p>
          </div>

          {canSubmit && (
            <div className="flex flex-col gap-y-3">
              <div>
                <label className={labelClass}>Transfer screenshot</label>
                {!previewUrl ? (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleUpload(f)
                      }}
                      disabled={uploadingProof}
                      className="mt-1 block w-full text-sm text-ink-muted file:mr-3 file:rounded-control file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
                      data-testid="bank-proof-file-input"
                    />
                    {uploadingProof && progress !== null && (
                      <div className="mt-2" data-testid="bank-proof-progress">
                        <div
                          className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Upload progress"
                        >
                          <div
                            className="h-full rounded-full bg-ink transition-[width] duration-150"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-ink-muted" role="status">
                          {progress < 90
                            ? `Uploading… ${progress}%`
                            : progress < 100
                              ? "Verifying with the store…"
                              : "Ready ✓"}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className="mt-2 flex items-center gap-3 rounded-control border border-ink-hairline bg-white p-2"
                    data-testid="bank-proof-preview"
                  >
                    <img
                      src={previewUrl}
                      alt="Your transfer screenshot preview"
                      className="h-20 w-20 rounded-control border border-ink-hairline object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-emerald-700">
                        Screenshot ready ✓
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        Check it shows the amount and reference, then submit below.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearUpload}
                      className="shrink-0 rounded-control border border-ink-hairline px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-ink hover:text-white active:scale-[0.97]"
                      data-testid="bank-proof-retake"
                    >
                      Retake
                    </button>
                  </div>
                )}
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
                    aria-describedby="bank-proof-amount-hint"
                  />
                  <p id="bank-proof-amount-hint" className="mt-1 text-xs" data-testid="bank-proof-amount-match">
                    {amountMatch === null ? (
                      <span className="text-ink-muted">
                        Expected: {fmt(expectedAmount)}
                      </span>
                    ) : amountMatch ? (
                      <span className="font-medium text-emerald-700">
                        ✓ Matches {fmt(expectedAmount)}
                      </span>
                    ) : (
                      <span className="font-medium text-amber-700">
                        ⚠ You entered {fmt(enteredAmount ?? 0)} — expected{" "}
                        {fmt(expectedAmount)}
                      </span>
                    )}
                  </p>
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
                src={transfer.proof_url.startsWith("http") ? transfer.proof_url : `${backendUrl}${transfer.proof_url}`}
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
