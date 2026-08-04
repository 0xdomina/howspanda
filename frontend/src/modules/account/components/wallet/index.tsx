"use client"

import { useState, useTransition } from "react"

import { NIGERIAN_BANKS, bankNameToCode } from "@lib/data/banks"
import {
  addWithdrawalAccount,
  createWithdrawal,
  type BuyerWithdrawal,
  type WalletLedger,
  type WithdrawalAccount,
} from "@lib/data/wallet"

const money = (amount: number | string | null | undefined, currency = "ngn") => {
  const value = Number(amount ?? 0)
  const show = Math.abs(value) < 0.005 ? 0 : value
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency.toUpperCase() === "NGN" ? "NGN" : "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(show) ? show : 0)
}

const AddBankForm = ({ email, onDone }: { email: string; onDone: () => void }) => {
  const [bankName, setBankName] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    const bankCode = bankNameToCode(bankName)
    if (!bankCode) {
      setError("Choose your bank from the list.")
      return
    }
    if (accountNumber.replace(/\D/g, "").length !== 10) {
      setError("Account number must be 10 digits.")
      return
    }
    startTransition(async () => {
      const res = await addWithdrawalAccount(email, {
        type: "bank_account",
        bank_code: bankCode,
        account_number: accountNumber.trim(),
      })
      if (res.success) {
        setBankName("")
        setAccountNumber("")
        onDone()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Bank name</label>
        <select
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        >
          <option value="">Select your bank…</option>
          {NIGERIAN_BANKS.map((bank) => (
            <option key={bank.code} value={bank.name}>
              {bank.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Account number</label>
        <input
          value={accountNumber}
          onChange={(e) =>
            setAccountNumber(e.target.value.replace(/[^\d]/g, "").slice(0, 10))
          }
          placeholder="10-digit NUBAN"
          inputMode="numeric"
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={submit}
        className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Add bank account"}
      </button>
    </div>
  )
}

const AddCryptoForm = ({ email, onDone }: { email: string; onDone: () => void }) => {
  const [network, setNetwork] = useState<"base" | "solana">("base")
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    if (!address.trim()) {
      setError("Enter a USDC address.")
      return
    }
    startTransition(async () => {
      const res = await addWithdrawalAccount(email, {
        type: "crypto_address",
        network,
        address: address.trim(),
      })
      if (res.success) {
        setAddress("")
        onDone()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Network</label>
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value as "base" | "solana")}
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        >
          <option value="base">Base (USDC)</option>
          <option value="solana">Solana (USDC)</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">USDC address</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={network === "base" ? "0x…" : "solana address…"}
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={submit}
        className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Add USDC address"}
      </button>
    </div>
  )
}

const WithdrawalAccounts = ({
  email,
  accounts,
}: {
  email: string
  accounts: WithdrawalAccount[]
}) => {
  const [adding, setAdding] = useState<"bank" | "crypto" | null>(null)

  const reload = () => {
    window.location.reload()
  }

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-ink">Withdrawal accounts</h3>
        <div className="flex gap-2">
          {!adding && (
            <>
              <button
                type="button"
                onClick={() => setAdding("bank")}
                className="rounded-medium border border-ink-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-white"
              >
                Add bank
              </button>
              <button
                type="button"
                onClick={() => setAdding("crypto")}
                className="rounded-medium border border-ink-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-white"
              >
                Add USDC
              </button>
            </>
          )}
        </div>
      </div>

      {adding && (
        <div className="mb-4 rounded-medium border border-ink-hairline p-4">
          {adding === "bank" ? (
            <AddBankForm email={email} onDone={reload} />
          ) : (
            <AddCryptoForm email={email} onDone={reload} />
          )}
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No withdrawal accounts yet. Add a bank account or USDC address to receive
          funds.
        </p>
      ) : (
        <ul className="divide-y divide-ink-hairline">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                {account.type === "bank_account" ? (
                  <>
                    <p className="truncate text-sm font-medium text-ink">
                      {account.account_name ?? "Bank account"}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      ••••{String(account.account_number ?? "").slice(-4)} ·{" "}
                      {account.currency_code?.toUpperCase()}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="truncate text-sm font-medium text-ink">
                      USDC · {account.network}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{account.address}</p>
                  </>
                )}
              </div>
              {account.is_default && (
                <span className="shrink-0 rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink">
                  Default
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const WithdrawalHistory = ({ withdrawals }: { withdrawals: BuyerWithdrawal[] }) => {
  if (withdrawals.length === 0) {
    return <p className="text-sm text-ink-muted">No withdrawals yet.</p>
  }
  return (
    <ul className="divide-y divide-ink-hairline">
      {withdrawals.map((w) => (
        <li key={w.id} className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">
              {w.rail === "crypto-usdc" ? "USDC withdrawal" : "Bank withdrawal"}
            </p>
            <p className="text-xs text-ink-muted">
              {w.created_at ? new Date(w.created_at).toLocaleDateString() : ""} · {w.status}
              {w.failure_reason ? ` — ${w.failure_reason}` : ""}
            </p>
          </div>
          <p className="font-mono tabular-nums text-sm text-ink">
            {money(w.amount, w.currency_code)}
          </p>
        </li>
      ))}
    </ul>
  )
}

const RequestWithdrawal = ({
  email,
  balance,
  accounts,
  minimum,
  enabledRails,
}: {
  email: string
  balance: number
  accounts: WithdrawalAccount[]
  minimum: number
  enabledRails: string[]
}) => {
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const available = Number(balance ?? 0)
  const min = Number(minimum ?? 0)
  const canPay = available >= min && available > 0
  const hasBank = accounts.some((a) => a.type === "bank_account")
  const hasCrypto = accounts.some((a) => a.type === "crypto_address")

  const request = (rail: "paystack" | "crypto-usdc") => {
    setMessage(null)
    startTransition(async () => {
      const res = await createWithdrawal(email, rail, available)
      if (res.success) {
        setMessage("Withdrawal requested. It will be sent to your withdrawal account.")
      } else {
        setMessage(res.error)
      }
    })
  }

  return (
    <div className="rounded-line border border-ink-hairline bg-paper-surface p-4">
      <h3 className="font-display text-lg font-medium text-ink">Withdraw</h3>
      <p className="mt-1 text-sm text-ink-muted">
        {available > 0 ? (
          <>
            {money(available, "ngn")} available. Minimum withdrawal is{" "}
            {money(min, "ngn")}.
          </>
        ) : (
          "Nothing available to withdraw yet."
        )}
      </p>
      {message && <p className="mt-2 text-sm text-ink-muted">{message}</p>}
      <div className="mt-3 flex flex-col gap-2">
        {enabledRails.includes("paystack") && (
          <button
            type="button"
            disabled={!canPay || isPending}
            onClick={() => request("paystack")}
            className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
          >
            {isPending ? "Requesting…" : "Request bank withdrawal"}
          </button>
        )}
        {enabledRails.includes("crypto-usdc") && (
          <button
            type="button"
            disabled={!canPay || isPending}
            onClick={() => request("crypto-usdc")}
            className="rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-40"
          >
            Request USDC withdrawal
          </button>
        )}
      </div>
      {!canPay && available > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          Balance is below the {money(min, "ngn")} minimum withdrawal.
        </p>
      )}
      {canPay && !hasBank && (
        <p className="mt-2 text-xs text-ink-muted">
          Add a bank account below to receive bank withdrawals.
        </p>
      )}
      {canPay && !hasCrypto && (
        <p className="mt-2 text-xs text-ink-muted">
          Add a USDC address below to receive crypto withdrawals.
        </p>
      )}
    </div>
  )
}

const WalletClient = ({
  email,
  balance,
  minimum,
  ledger,
  accounts,
  withdrawals,
  enabledRails,
}: {
  email: string
  balance: number
  minimum: number
  ledger: WalletLedger[]
  accounts: WithdrawalAccount[]
  withdrawals: BuyerWithdrawal[]
  enabledRails: string[]
}) => {
  const credits = ledger.filter((l) => Number(l.amount) > 0).reduce((s, l) => s + Number(l.amount), 0)
  const debits = ledger.filter((l) => Number(l.amount) < 0).reduce((s, l) => s + Math.abs(Number(l.amount)), 0)
  const totals = [
    { label: "Current balance", value: balance },
    { label: "Total credits", value: credits },
    { label: "Total withdrawn", value: debits },
  ]

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Wallet
      </h2>

      <div className="grid grid-cols-3 gap-4">
        {totals.map((t) => (
          <div
            key={t.label}
            className="rounded-line border border-ink-hairline bg-paper-surface p-4"
          >
            <p className="text-xs text-ink-muted">{t.label}</p>
            <p className="mt-1 font-mono tabular-nums text-lg text-ink">
              {money(t.value, "ngn")}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 small:grid-cols-2">
        <RequestWithdrawal
          email={email}
          balance={balance}
          accounts={accounts}
          minimum={minimum}
          enabledRails={enabledRails}
        />
        <WithdrawalAccounts email={email} accounts={accounts} />
      </div>

      <div className="rounded-line border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">Transaction history</h3>
        <div className="mt-2">
          {ledger.length === 0 ? (
            <p className="text-sm text-ink-muted">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-ink-hairline">
              {ledger.map((l) => {
                const positive = Number(l.amount) > 0
                return (
                  <li key={l.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{l.source}</p>
                      <p className="text-xs text-ink-muted">
                        {l.created_at ? new Date(l.created_at).toLocaleDateString() : ""}
                        {l.reference ? ` · ${l.reference}` : ""}
                      </p>
                    </div>
                    <p
                      className={`font-mono tabular-nums text-sm ${
                        positive ? "text-emerald-600" : "text-ink"
                      }`}
                    >
                      {positive ? "+" : "−"}
                      {money(Math.abs(Number(l.amount)), "ngn")}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-line border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">Withdrawals</h3>
        <div className="mt-2">
          <WithdrawalHistory withdrawals={withdrawals} />
        </div>
      </div>
    </div>
  )
}

export default WalletClient