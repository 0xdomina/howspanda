"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Heading } from "@medusajs/ui"

import Input from "@modules/common/components/input"
import Modal from "@modules/common/components/modal"
import useToggleState from "@lib/hooks/use-toggle-state"
import {
  withdrawCryptoWallet,
  type CryptoWalletSummary,
} from "@lib/data/crypto-wallet"

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const AMOUNT_RE = /^\d+(\.\d{1,6})?$/

const formatUsdc = (amount: string | number | null | undefined) => {
  const value = Number(amount ?? 0)
  const show = Math.abs(value) < 0.0000005 ? 0 : value
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(Number.isFinite(show) ? show : 0)
}

const shortAddress = (address: string) =>
  address.length > 18
    ? `${address.slice(0, 10)}…${address.slice(-8)}`
    : address

const SendUsdcModal = ({
  wallet,
  balance,
  onDone,
}: {
  wallet: CryptoWalletSummary["wallet"]
  balance: string
  onDone: () => void
}) => {
  const { state: isOpen, open, close: closeModal } = useToggleState(false)
  const [toAddress, setToAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const idempotencyKeyRef = useRef<string | undefined>(undefined)

  const reset = () => {
    setToAddress("")
    setAmount("")
    setPassword("")
    setError(null)
    setSuccess(false)
  }

  const close = () => {
    reset()
    closeModal()
  }

  const openModal = () => {
    idempotencyKeyRef.current = crypto.randomUUID()
    reset()
    open()
  }

  const submit = () => {
    setError(null)
    if (!ADDRESS_RE.test(toAddress.trim())) {
      setError("Enter a valid USDC address (0x + 40 hex characters).")
      return
    }
    if (!AMOUNT_RE.test(amount.trim()) || Number(amount) <= 0) {
      setError("Enter an amount with up to 6 decimal places.")
      return
    }
    if (Number(amount) > Number(balance)) {
      setError("Amount exceeds your USDC balance.")
      return
    }
    if (!password) {
      setError("Re-enter your password to confirm this transfer.")
      return
    }
    startTransition(async () => {
      const res = await withdrawCryptoWallet({
        to_address: toAddress.trim(),
        usdc_amount: amount.trim(),
        password,
        idempotency_key: idempotencyKeyRef.current!,
      })
      if (res.success) {
        setSuccess(true)
        onDone()
      } else {
        setError(res.error ?? "Something went wrong. Please try again.")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={Number(balance) <= 0}
        className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
        data-testid="send-usdc-button"
      >
        Send USDC
      </button>

      <Modal isOpen={isOpen} close={close} data-testid="send-usdc-modal">
        <Modal.Title>
          <Heading className="mb-2">Send USDC</Heading>
        </Modal.Title>
        <Modal.Body>
          <div className="flex flex-col gap-y-4">
            {success ? (
              <p className="text-sm text-emerald-600" data-testid="send-usdc-success">
                Transfer signed and broadcast. It will confirm shortly.
              </p>
            ) : (
              <>
                <div className="rounded-medium border border-ink-hairline bg-paper-surface p-3 text-xs text-ink-muted">
                  Sending from your managed wallet{" "}
                  <span className="font-mono text-ink">
                    {shortAddress(wallet.address)}
                  </span>{" "}
                  · Balance:{" "}
                  <span className="font-mono tabular-nums text-ink">
                    {formatUsdc(balance)} USDC
                  </span>
                </div>
                <Input
                  label="Destination address"
                  name="to_address"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  autoComplete="off"
                  data-testid="send-usdc-address"
                />
                <Input
                  label="Amount (USDC)"
                  name="usdc_amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  data-testid="send-usdc-amount"
                />
                <Input
                  label="Password"
                  type="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  data-testid="send-usdc-password"
                />
                <p className="text-xs text-ink-muted">
                  Re-entering your password confirms this transfer. It cannot be
                  undone.
                </p>
              </>
            )}
            {error && (
              <p className="text-sm text-rose-600" data-testid="send-usdc-error">
                {error}
              </p>
            )}
          </div>
        </Modal.Body>
        {!success && (
          <Modal.Footer>
            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={close}
                className="h-10"
                data-testid="cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="h-10"
                data-testid="send-usdc-submit"
              >
                {isPending ? "Sending…" : "Send USDC"}
              </Button>
            </div>
          </Modal.Footer>
        )}
      </Modal>
    </>
  )
}

const CryptoWallet = ({
  initial,
}: {
  initial: CryptoWalletSummary | null
}) => {
  const router = useRouter()

  if (!initial) {
    return null
  }

  const { wallet, balance_usdc } = initial

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-medium text-ink">
            USDC wallet
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            {wallet.network} · {wallet.env}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono tabular-nums text-lg text-ink">
            {formatUsdc(balance_usdc)}{" "}
            <span className="text-xs text-ink-muted">USDC</span>
          </p>
          <p className="mt-0.5 break-all font-mono text-xs text-ink-muted">
            {wallet.address}
          </p>
        </div>
      </div>
      <SendUsdcModal
        wallet={wallet}
        balance={balance_usdc}
        onDone={() => router.refresh()}
      />
    </div>
  )
}

export default CryptoWallet
