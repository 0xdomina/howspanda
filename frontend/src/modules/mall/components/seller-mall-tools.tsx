"use client"

import { useMemo, useState, useTransition } from "react"
import { createMall, joinMallAsSeller, type Mall } from "@lib/data/mall"
import type { SellerProduct } from "@lib/data/seller"

const ngn = (value: number | string | undefined) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))

const inputClass =
  "w-full rounded-medium border border-ink-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink"

export const MallProductPicker = ({
  products,
  selected,
  onChange,
}: {
  products: SellerProduct[]
  selected: string[]
  onChange: (ids: string[]) => void
}) => {
  const published = products.filter((product) => product.status === "published")
  const selectedSet = new Set(selected)

  if (!published.length) {
    return (
      <p className="rounded-medium bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Publish at least one product before joining a mall.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="block text-xs font-medium text-ink">Products in this mall</label>
        <button
          type="button"
          className="text-xs text-ink-muted underline underline-offset-2"
          onClick={() =>
            onChange(selected.length === published.length ? [] : published.map((p) => p.id))
          }
        >
          {selected.length === published.length ? "Clear all" : "Select all"}
        </button>
      </div>
      <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto small:grid-cols-3">
        {published.map((product) => {
          const checked = selectedSet.has(product.id)
          return (
            <label
              key={product.id}
              className={`cursor-pointer overflow-hidden rounded-medium border text-xs ${
                checked ? "border-ink bg-ink/5" : "border-ink-hairline bg-paper-surface"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((id) => id !== product.id)
                      : [...selected, product.id]
                  )
                }
              />
              <div className="aspect-square bg-ink/5">
                {product.thumbnail ? (
                  <img src={product.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-lg text-ink/20">
                    {product.title[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </div>
              <p className="truncate px-2 py-1.5 text-ink">{product.title}</p>
            </label>
          )
        })}
      </div>
      <p className="text-xs text-ink-muted">{selected.length} product(s) selected</p>
    </div>
  )
}

export const CreateMallForm = ({
  products,
  availableBalanceNgn,
  onDone,
}: {
  products: SellerProduct[]
  availableBalanceNgn?: number | null
  onDone: () => void
}) => {
  const publishedIds = useMemo(
    () => products.filter((product) => product.status === "published").map((product) => product.id),
    [products]
  )
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [prizePoolNgn, setPrizePoolNgn] = useState("")
  const [prizeWinnerCount, setPrizeWinnerCount] = useState("3")
  const [targetSellers, setTargetSellers] = useState("5")
  const [targetBuyers, setTargetBuyers] = useState("10")
  const [durationDays, setDurationDays] = useState("7")
  const [prizeDistribution, setPrizeDistribution] = useState<"equal" | "random">("equal")
  const [selected, setSelected] = useState(publishedIds)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    const pool = Number(prizePoolNgn)
    if (!name.trim() || pool <= 0 || selected.length === 0) {
      setError("Add a name, a positive contribution, and at least one published product.")
      return
    }
    if (availableBalanceNgn != null && pool > availableBalanceNgn) {
      setError(`Your available store balance is ${ngn(availableBalanceNgn)}.`)
      return
    }
    startTransition(async () => {
      const result = await createMall({
        name: name.trim(),
        description: description.trim() || undefined,
        prizePoolNgn: pool,
        prizeWinnerCount: Number(prizeWinnerCount),
        prizeDistribution,
        targetSellers: Number(targetSellers),
        targetBuyers: Number(targetBuyers),
        durationDays: Number(durationDays),
        productIds: selected,
      })
      if (result.success) onDone()
      else setError(result.error)
    })
  }

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-5">
      <h2 className="font-display text-2xl font-medium text-ink">Create a mall</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Start a shopping event, choose the products to feature, and set the number of sellers and buyers needed to open it.
      </p>
      <div className="mt-5 space-y-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mall name" className={inputClass} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What makes this mall special?" className={inputClass} />
        <div className="grid grid-cols-2 gap-3">
          <input type="number" min="1" value={prizePoolNgn} onChange={(e) => setPrizePoolNgn(e.target.value)} placeholder="Your contribution (₦)" className={inputClass} />
          <input type="number" min="1" value={prizeWinnerCount} onChange={(e) => setPrizeWinnerCount(e.target.value)} placeholder="Winners" className={inputClass} />
          <input type="number" min="2" value={targetSellers} onChange={(e) => setTargetSellers(e.target.value)} placeholder="Sellers needed" className={inputClass} />
          <input type="number" min="2" value={targetBuyers} onChange={(e) => setTargetBuyers(e.target.value)} placeholder="Buyers needed" className={inputClass} />
          <input type="number" min="1" max="30" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="Duration (days)" className={inputClass} />
          <select value={prizeDistribution} onChange={(e) => setPrizeDistribution(e.target.value as "equal" | "random")} className={inputClass}>
            <option value="equal">Equal prizes</option>
            <option value="random">Random prizes</option>
          </select>
        </div>
        {availableBalanceNgn != null && (
          <p className="text-xs text-ink-muted">Available store balance: {ngn(availableBalanceNgn)}. Contributions are reserved from this balance.</p>
        )}
        <MallProductPicker products={products} selected={selected} onChange={setSelected} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="button" disabled={isPending} onClick={submit} className="w-full rounded-control bg-ink px-4 py-3 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50">
          {isPending ? "Creating…" : "Create mall"}
        </button>
      </div>
    </div>
  )
}

export const JoinMallForm = ({
  malls,
  products,
  availableBalanceNgn,
  onDone,
}: {
  malls: Mall[]
  products: SellerProduct[]
  availableBalanceNgn?: number | null
  onDone: () => void
}) => {
  const pendingMalls = malls.filter((mall) => mall.status === "pending")
  const publishedIds = useMemo(
    () => products.filter((product) => product.status === "published").map((product) => product.id),
    [products]
  )
  const [mallId, setMallId] = useState(pendingMalls[0]?.id ?? "")
  const [contribution, setContribution] = useState("")
  const [selected, setSelected] = useState(publishedIds)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    const amount = Number(contribution)
    if (!mallId || amount <= 0 || selected.length === 0) {
      setError("Choose a mall, enter a contribution, and select at least one published product.")
      return
    }
    if (availableBalanceNgn != null && amount > availableBalanceNgn) {
      setError(`Your available store balance is ${ngn(availableBalanceNgn)}.`)
      return
    }
    startTransition(async () => {
      const result = await joinMallAsSeller(mallId, amount, selected)
      if (result.success) onDone()
      else setError(result.error)
    })
  }

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-5">
      <h2 className="font-display text-xl font-medium text-ink">Join a mall as a seller</h2>
      <p className="mt-1 text-sm text-ink-muted">Your selected products will appear in the mall. Shopping opens after its seller and buyer targets are met.</p>
      <div className="mt-4 space-y-4">
        {pendingMalls.length ? (
          <select value={mallId} onChange={(e) => setMallId(e.target.value)} className={inputClass}>
            {pendingMalls.map((mall) => (
              <option key={mall.id} value={mall.id}>{mall.name} · {ngn(mall.prize_pool_ngn)} pool</option>
            ))}
          </select>
        ) : (
          <p className="rounded-medium bg-ink/5 px-3 py-2 text-sm text-ink-muted">There are no malls currently gathering sellers.</p>
        )}
        <input type="number" min="1" value={contribution} onChange={(e) => setContribution(e.target.value)} placeholder="Contribution (₦)" className={inputClass} disabled={!pendingMalls.length} />
        {availableBalanceNgn != null && <p className="text-xs text-ink-muted">Available store balance: {ngn(availableBalanceNgn)}.</p>}
        <MallProductPicker products={products} selected={selected} onChange={setSelected} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="button" disabled={isPending || !pendingMalls.length} onClick={submit} className="w-full rounded-control bg-ink px-4 py-3 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50">
          {isPending ? "Joining…" : "Join mall"}
        </button>
      </div>
    </div>
  )
}
