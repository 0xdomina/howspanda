"use client"

import { useState, useTransition } from "react"

import { NIGERIAN_BANKS, bankNameToCode } from "@lib/data/banks"
import {
  createPayoutAccount,
  requestSellerPayout,
  giveSellerTip,
  type SellerProduct,
  type SellerRedeemable,
  type SellerTip,
} from "@lib/data/seller"

const money = (amount: number | string, currency: string) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency.toUpperCase(),
    // Backend amounts are minor units (kobo) — divide to major for display.
  }).format(Number(amount ?? 0) / 100)

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
  enabledRails,
}: {
  balance: any
  payoutAccounts: any[]
  enabledRails: string[]
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
        {enabledRails.includes("paystack") && (
          <button
            type="button"
            disabled={!canPay || isPending}
            onClick={() => request("paystack")}
            className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
          >
            {isPending ? "Requesting…" : "Request bank payout"}
          </button>
        )}
        {enabledRails.includes("crypto-usdc") && (
          <button
            type="button"
            disabled={!canPay || isPending}
            onClick={() => request("crypto-usdc")}
            className="rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-40"
          >
            Request USDC payout
          </button>
        )}
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

const CommissionsCard = ({ commissions }: { commissions: any }) => {
  const summary = commissions?.summary
  const rate = Number(commissions?.commission_rate ?? 0)

  if (!summary || Object.keys(summary).length === 0) {
    return (
      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">
          Commissions
        </h3>
        <p className="mt-2 text-sm text-ink-muted">
          No sales yet. Commissions are charged on every completed order.
          {rate > 0 && <> Your commission rate is {rate * 100}%.</>}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-ink">
          Commissions
        </h3>
        {rate > 0 && (
          <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs text-ink-muted">
            {rate * 100}% rate
          </span>
        )}
      </div>
      <ul className="space-y-3">
        {Object.entries(summary as Record<string, any>).map(
          ([currency, s]) => (
            <li
              key={currency}
              className="flex items-center justify-between gap-4 rounded-medium border border-ink-hairline p-3"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  Gross: {money(s.gross, currency)}
                </p>
                <p className="text-xs text-ink-muted">
                  Commission: {money(s.commission, currency)}
                </p>
              </div>
              <p className="font-mono tabular-nums text-sm text-ink">
                Net: {money(s.net, currency)}
              </p>
            </li>
          )
        )}
      </ul>
    </div>
  )
}

const TipsCard = ({ tips, summary, products, redeemables }: { tips: SellerTip[]; summary: any; products: SellerProduct[]; redeemables: SellerRedeemable[] }) => {
  const [giftType, setGiftType] = useState<"cash" | "redeemable" | "product">("cash")
  const [buyerEmail, setBuyerEmail] = useState("")
  const [amount, setAmount] = useState("")
  const [code, setCode] = useState("")
  const [productId, setProductId] = useState("")
  const [note, setNote] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const send = () => startTransition(async () => {
    setMessage(null)
    const product = products.find((item) => item.id === productId)
    const result = await giveSellerTip({
      buyer_email: buyerEmail,
      amount: giftType === "cash" && amount ? Number(amount) : undefined,
      redeemable_code: giftType === "redeemable" ? code || undefined : undefined,
      product_id: giftType === "product" ? productId || undefined : undefined,
      product_title: giftType === "product" ? product?.title : undefined,
      note: note || undefined,
    })
    if (result.success) { setBuyerEmail(""); setAmount(""); setCode(""); setProductId(""); setNote(""); setMessage("Thank-you sent.") } else setMessage(result.error)
  })

  return <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-lg font-medium text-ink">Thank a buyer</h3><p className="mt-1 text-sm text-ink-muted">Send money, a store pass, or an extra product.</p></div><div className="text-right text-xs text-ink-muted"><p>Received {money(Number(summary?.in_amount ?? 0) * 100, "ngn")}</p><p>Given {money(Number(summary?.out_amount ?? 0) * 100, "ngn")}</p></div></div>
    <div className="mt-4 grid gap-2 small:grid-cols-2"><input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} type="email" placeholder="Buyer email" className="rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink" /><select value={giftType} onChange={(e) => setGiftType(e.target.value as typeof giftType)} className="rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink"><option value="cash">Cash tip</option><option value="redeemable">Gift card, voucher or ticket</option><option value="product">Extra product</option></select>
      {giftType === "cash" && <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="100" placeholder="Cash amount (NGN)" className="rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink" />}
      {giftType === "redeemable" && <select value={code} onChange={(e) => setCode(e.target.value)} className="rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink"><option value="">Choose a store pass</option>{redeemables.filter((item) => item.status === "active" && !item.issued_to_email).map((item) => <option key={item.id} value={item.code}>{item.title ?? item.type} · {item.code}</option>)}</select>}
      {giftType === "product" && <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink"><option value="">Choose a product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>}
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Short note (optional)" className="rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink" /></div>
    <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-ink-muted">{giftType === "product" ? "The buyer receives a private collection pass." : giftType === "redeemable" ? "Only unused store passes can be gifted." : "Cash gifts use your available seller balance."}</p><button type="button" disabled={isPending || !buyerEmail || (giftType === "cash" ? !amount : giftType === "redeemable" ? !code : !productId)} onClick={send} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Sending…" : "Send thank-you"}</button></div>{message && <p className="mt-2 text-sm text-ink-muted">{message}</p>}
    <div className="mt-5 border-t border-ink-hairline pt-4"><p className="text-sm font-medium text-ink">Recent tips</p>{tips.length === 0 ? <p className="mt-2 text-sm text-ink-muted">No tips yet.</p> : <ul className="mt-2 divide-y divide-ink-hairline">{tips.slice(0, 8).map((tip) => <li key={tip.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-ink-muted">{tip.direction === "to_seller" ? "Received" : "Given"} · {tip.buyer_email ?? "buyer"}</span><span className="font-mono text-ink">{tip.amount ? money(Number(tip.amount) * 100, "ngn") : tip.redeemable_code ?? tip.product_title ?? "Gift"}</span></li>)}</ul>}</div>
  </div>
}

const SellerMoneyClient = ({
  balance,
  commissions,
  payoutAccounts,
  payouts,
  enabledRails,
  tips,
  tipSummary,
  products,
  redeemables,
}: {
  balance: any
  commissions: any
  payoutAccounts: any[]
  payouts: any[]
  enabledRails: string[]
  tips: SellerTip[]
  tipSummary: any
  products: SellerProduct[]
  redeemables: SellerRedeemable[]
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

      <CommissionsCard commissions={commissions} />
      <TipsCard tips={tips} summary={tipSummary} products={products} redeemables={redeemables} />

      <div className="grid grid-cols-1 gap-6 small:grid-cols-2">
        <RequestPayout
          balance={balance}
          payoutAccounts={payoutAccounts}
          enabledRails={enabledRails}
        />
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
