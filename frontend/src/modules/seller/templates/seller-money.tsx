"use client"

import { useState, useTransition } from "react"

import { NIGERIAN_BANKS, bankNameToCode } from "@lib/data/banks"
import {
  createPayoutAccount,
  requestSellerPayout,
} from "@lib/data/seller"

const money = (amount: number | string, currency: string) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(Number(amount ?? 0))

const AddBankForm = ({ onDone }: { onDone: () => void }) => {
  const [accountName, setAccountName] = useState("")
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
      const res = await createPayoutAccount({
        type: "bank_account",
        bank_code: bankCode,
        account_name: accountName.trim(),
        account_number: accountNumber.trim(),
      })
      if (res.success) {
        setAccountName("")
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
        <label className="mb-1 block text-xs text-ink-muted">Account name</label>
        <input
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="e.g. Adaeze Okafor"
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>
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

const AddCryptoForm = ({ onDone }: { onDone: () => void }) => {
  const [network, setNetwork] = useState<"base" | "solana">("base")
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const res = await createPayoutAccount({ type: "crypto_address", network, address: address.trim() })
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

const PayoutAccounts = ({ accounts }: { accounts: any[] }) => {
  const [adding, setAdding] = useState<"bank" | "crypto" | null>(null)

  const reload = () => {
    window.location.reload()
  }

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-ink">Payout accounts</h3>
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
            <AddBankForm onDone={reload} />
          ) : (
            <AddCryptoForm onDone={reload} />
          )}
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No payout accounts yet. Add a bank account or USDC address to receive
          payouts.
        </p>
      ) : (
        <ul className="divide-y divide-ink-hairline">
          {accounts.map((account: any) => (
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
                    <p className="truncate text-sm font-medium text-ink">USDC · {account.network}</p>
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

const PayoutHistory = ({ payouts }: { payouts: any[] }) => {
  if (payouts.length === 0) {
    return <p className="text-sm text-ink-muted">No payouts yet.</p>
  }
  return (
    <ul className="divide-y divide-ink-hairline">
      {payouts.map((p: any) => (
        <li key={p.id} className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">
              {p.rail === "crypto-usdc" ? "USDC payout" : "Bank payout"}
            </p>
            <p className="text-xs text-ink-muted">
              {new Date(p.created_at).toLocaleDateString()} · {p.status}
              {p.failure_reason ? ` — ${p.failure_reason}` : ""}
            </p>
          </div>
          <p className="font-mono tabular-nums text-sm text-ink">
            {money(p.amount, p.currency_code)}
          </p>
        </li>
      ))}
    </ul>
  )
}

const RequestPayout = ({
  balance,
  payoutAccounts,
}: {
  balance: any
  payoutAccounts: any[]
}) => {
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ngn = balance?.balances?.ngn ?? {}
  const available = Number(ngn.available ?? 0)
  const min = Number(balance?.minimum_ngn ?? 0)
  const canPay = available >= min
  const bankAccount = payoutAccounts.find(
    (a) => a.type === "bank_account" && a.status === "verified"
  )

  const request = (rail: "paystack" | "crypto-usdc") => {
    setMessage(null)
    startTransition(async () => {
      const res = await requestSellerPayout(rail)
      if (res.success) {
        setMessage("Payout requested. It will be sent to your payout account.")
      } else {
        setMessage(res.error)
      }
    })
  }

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
      <h3 className="font-display text-lg font-medium text-ink">Withdraw</h3>
      <p className="mt-1 text-sm text-ink-muted">
        {available > 0 ? (
          <>
            {money(available, "ngn")} available. Minimum payout is {money(min, "ngn")}.
          </>
        ) : (
          "Nothing available to withdraw yet."
        )}
      </p>
      {message && <p className="mt-2 text-sm text-ink-muted">{message}</p>}
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          disabled={!canPay || isPending}
          onClick={() => request("paystack")}
          className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
        >
          {isPending ? "Requesting…" : "Request bank payout"}
        </button>
        <button
          type="button"
          disabled={!canPay || isPending}
          onClick={() => request("crypto-usdc")}
          className="rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-40"
        >
          Request USDC payout
        </button>
      </div>
      {!canPay && available > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          Balance is below the {money(min, "ngn")} minimum payout.
        </p>
      )}
      {canPay && !bankAccount && (
        <p className="mt-2 text-xs text-ink-muted">
          Add a verified bank account below to receive payouts.
        </p>
      )}
    </div>
  )
}

const SellerMoneyClient = ({
  balance,
  payoutAccounts,
  payouts,
}: {
  balance: any
  payoutAccounts: any[]
  payouts: any[]
}) => {
  const ngn = balance?.balances?.ngn ?? {}
  const buckets: { label: string; value: number }[] = [
    { label: "Available", value: Number(ngn.available ?? 0) },
    { label: "In escrow", value: Number(ngn.pending ?? 0) },
    { label: "Reserved", value: Number(ngn.reserved ?? 0) },
    { label: "Paid out", value: Number(ngn.paid_out ?? 0) },
  ]

  return (
    <div data-testid="seller-money-page" className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Money
      </h2>

      <div className="grid grid-cols-2 gap-4 small:grid-cols-4">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="rounded-large border border-ink-hairline bg-paper-surface p-4"
          >
            <p className="text-xs text-ink-muted">{b.label}</p>
            <p className="mt-1 font-mono tabular-nums text-lg text-ink">
              {money(b.value, "ngn")}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 small:grid-cols-2">
        <RequestPayout balance={balance} payoutAccounts={payoutAccounts} />
        <PayoutAccounts accounts={payoutAccounts} />
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">Payout history</h3>
        <div className="mt-2">
          <PayoutHistory payouts={payouts} />
        </div>
      </div>
    </div>
  )
}

export default SellerMoneyClient
