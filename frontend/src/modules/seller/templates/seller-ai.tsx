"use client"

import { useState, useTransition } from "react"

import {
  askAiInsights,
  generateRecommendations,
  generateSellerBrief,
  getSellerAiQuota,
  runAiAccounting,
  runAiListing,
  runAiMarketing,
  runAiPricing,
  type AiQuota,
} from "@lib/data/seller"

const money = (amount: number | string | null | undefined) => {
  const value = Number(amount ?? 0)
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

const Error = ({ text }: { text: string | null }) =>
  text ? <p className="text-sm text-rose-600">{text}</p> : null

const Success = ({ text }: { text: string | null }) =>
  text ? (
    <p className="whitespace-pre-wrap rounded-medium bg-ink/5 border border-ink-hairline p-3 text-sm text-ink">
      {text}
    </p>
  ) : null

const useAction = () => {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<any>, onDone?: (data: any) => void) => {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res?.success) {
        onDone?.(res)
      } else {
        setError(res?.error ?? res?.message ?? "Something went wrong.")
      }
    })
  }
  return { isPending, error, setError, run }
}

// ── Brief ────────────────────────────────────────────────────────────────

const BriefTool = ({
  initial,
}: {
  initial: { narrative?: string | null; numbers?: any; opportunities?: any } | null
}) => {
  const [period, setPeriod] = useState<"daily" | "weekly">("daily")
  const [output, setOutput] = useState<any>(initial ?? null)
  const [displayed, setDisplayed] = useState<"stored" | "fresh">("stored")
  const { isPending, error, run } = useAction()

  const generate = () => {
    run(async () => generateSellerBrief(period), (res) => {
      setOutput({ narrative: res.result?.narrative, extra: res.extra })
      setDisplayed("fresh")
    })
  }

  const narrative = displayed === "fresh" ? output?.narrative : output?.narrative

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        A short plain-language brief of how your store is doing, from your own
        numbers.
      </p>
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Period</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "daily" | "weekly")}
            className="rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={generate}
          className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {isPending ? "Writing…" : "Write brief"}
        </button>
      </div>
      <Error text={error} />
      {!narrative && (
        <p className="text-sm text-ink-muted">
          No brief yet — generate one to see your store summary.
        </p>
      )}
      {narrative && <Success text={narrative} />}
    </div>
  )
}

// ── Recommendations ──────────────────────────────────────────────────────

const RecommendationsTool = () => {
  const [period, setPeriod] = useState<"daily" | "weekly">("daily")
  const [ops, setOps] = useState<
    { action: string; sku: string | null; explanation: string }[] | null
  >(null)
  const { isPending, error, run } = useAction()

  const generate = () => {
    run(async () => generateRecommendations(period), (res) =>
      setOps(res.result?.opportunities ?? [])
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Rule-ranked, store-specific actions (price, bundle, win-back) with a
        one-line explanation for each.
      </p>
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Period</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "daily" | "weekly")}
            className="rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={generate}
          className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {isPending ? "Thinking…" : "Get recommendations"}
        </button>
      </div>
      <Error text={error} />
      {ops && ops.length === 0 && (
        <p className="text-sm text-ink-muted">No opportunities found.</p>
      )}
      {ops && ops.length > 0 && (
        <ul className="divide-y divide-ink-hairline">
          {ops.map((op, i) => (
            <li key={i} className="py-3">
              <p className="text-sm font-medium text-ink">
                {op.action}
                {op.sku ? ` — ${op.sku}` : ""}
              </p>
              <p className="text-xs text-ink-muted">{op.explanation}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Insights ─────────────────────────────────────────────────────────────

const InsightsTool = () => {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState<string | null>(null)
  const { isPending, error, run } = useAction()

  const ask = () => {
    run(async () => askAiInsights(question.trim()), (res) =>
      setAnswer(res.result ?? null)
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Ask a question about your own store — the answer uses only your data.
      </p>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="e.g. Which products sell best on weekends?"
        rows={3}
        className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending || question.trim().length < 3}
          onClick={ask}
          className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {isPending ? "Thinking…" : "Ask"}
        </button>
      </div>
      <Error text={error} />
      {answer && <Success text={answer} />}
    </div>
  )
}

// ── Marketing coach ──────────────────────────────────────────────────────

const MarketingTool = () => {
  const [goal, setGoal] = useState("")
  const [tone, setTone] = useState("")
  const [out, setOut] = useState<{
    brand_voice?: string
    promo_ideas?: string[]
    bundle_suggestions?: string[]
  } | null>(null)
  const { isPending, error, run } = useAction()

  const generate = () => {
    run(async () => runAiMarketing(goal.trim() || undefined, tone.trim() || undefined), (res) =>
      setOut(res.result ?? {})
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Get grounded marketing ideas based on your catalog.
      </p>
      <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Goal (optional)</label>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. sell more this weekend"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Tone (optional)</label>
          <input
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            placeholder="e.g. friendly, direct"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={generate}
        className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Coaching…" : "Get marketing ideas"}
      </button>
      <Error text={error} />
      {out?.brand_voice && (
        <div className="space-y-3">
          <div className="rounded-medium bg-ink/5 border border-ink-hairline p-3">
            <p className="text-xs text-ink-muted">Brand voice</p>
            <p className="mt-1 text-sm text-ink">{out.brand_voice}</p>
          </div>
          {out.promo_ideas && out.promo_ideas.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-ink-muted">Promo ideas</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-ink">
                {out.promo_ideas.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {out.bundle_suggestions && out.bundle_suggestions.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-ink-muted">Bundle suggestions</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-ink">
                {out.bundle_suggestions.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Pricing advisor ──────────────────────────────────────────────────────

const PricingTool = () => {
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [cost, setCost] = useState("")
  const [out, setOut] = useState<{
    suggested_price?: number
    floor_price?: number
    ceiling_price?: number
    reasoning?: string
    market?: any
  } | null>(null)
  const { isPending, error, run } = useAction()

  const generate = () => {
    run(async () =>
      runAiPricing({
        title: title.trim(),
        category: category.trim() || undefined,
        cost: cost.trim() === "" ? undefined : Number(cost),
        currency_code: "ngn",
      })
    , (res) => setOut(res.result ?? {}))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Suggest a price for a product using anonymized marketplace stats.
      </p>
      <div className="grid grid-cols-1 small:grid-cols-3 gap-3">
        <div className="small:col-span-1">
          <label className="mb-1 block text-xs text-ink-muted">Product title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Handmade Ankara tote"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Category (optional)</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Bags"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Unit cost (₦, optional)</label>
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="e.g. 3000"
            inputMode="decimal"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
      </div>
      <button
        type="button"
        disabled={isPending || title.trim().length < 2}
        onClick={generate}
        className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Advising…" : "Suggest price"}
      </button>
      <Error text={error} />
      {out?.suggested_price != null && (
        <div className="rounded-medium bg-ink/5 border border-ink-hairline p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-ink-muted">Suggested</p>
              <p className="mt-1 font-mono tabular-nums text-lg text-ink">
                {money(out.suggested_price)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Floor</p>
              <p className="mt-1 font-mono tabular-nums text-lg text-ink">
                {money(out.floor_price)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Ceiling</p>
              <p className="mt-1 font-mono tabular-nums text-lg text-ink">
                {money(out.ceiling_price)}
              </p>
            </div>
          </div>
          {out.reasoning && <p className="mt-3 text-sm text-ink">{out.reasoning}</p>}
        </div>
      )}
    </div>
  )
}

// ── Listing writer ───────────────────────────────────────────────────────

const ListingTool = () => {
  const [notes, setNotes] = useState("")
  const [category, setCategory] = useState("")
  const [out, setOut] = useState<{
    title?: string
    description?: string
    tags?: string[]
    seo_title?: string
    seo_description?: string
  } | null>(null)
  const { isPending, error, run } = useAction()

  const generate = () => {
    run(async () => runAiListing(notes.trim(), category.trim() || undefined), (res) =>
      setOut(res.result ?? {})
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Turn rough notes into a ready-to-publish product listing.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. handwoven tote, 40cm wide, dark green with leather handles, can hold a laptop"
        rows={3}
        className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
      />
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Category (optional)</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Bags"
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>
      <button
        type="button"
        disabled={isPending || notes.trim().length < 2}
        onClick={generate}
        className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Writing…" : "Write listing"}
      </button>
      <Error text={error} />
      {out?.title && (
        <div className="space-y-3 rounded-medium bg-ink/5 border border-ink-hairline p-4">
          <div>
            <p className="text-xs text-ink-muted">Title</p>
            <p className="mt-1 font-medium text-ink">{out.title}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Description</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{out.description}</p>
          </div>
          {out.tags && out.tags.length > 0 && (
            <div>
              <p className="text-xs text-ink-muted">Tags</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {out.tags.map((t, i) => (
                  <span key={i} className="rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-ink-muted">SEO</p>
            <p className="mt-1 text-sm text-ink">{out.seo_title}</p>
            <p className="text-xs text-ink-muted">{out.seo_description}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Accounting ───────────────────────────────────────────────────────────

const AccountingTool = () => {
  const [out, setOut] = useState<string | null>(null)
  const [aggregates, setAggregates] = useState<any>(null)
  const { isPending, error, run } = useAction()

  const generate = () => {
    run(async () => runAiAccounting(), (res) => {
      setOut(typeof res.result === "string" ? res.result : JSON.stringify(res.result))
      setAggregates(res.extra?.aggregates ?? null)
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        A plain-language digest of your earnings: gross, commission, net.
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={generate}
        className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Digesting…" : "Accounting digest"}
      </button>
      <Error text={error} />
      {out && <Success text={out} />}
      {aggregates?.by_currency && (
        <div className="rounded-medium bg-ink/5 border border-ink-hairline p-4">
          <p className="mb-2 text-xs text-ink-muted">Deterministic totals</p>
          {Object.entries(aggregates.by_currency as Record<string, any>).map(
            ([currency, a]) => (
              <div key={currency} className="grid grid-cols-4 gap-2 text-sm text-ink">
                <span className="font-mono">{currency.toUpperCase()}</span>
                <span className="tabular-nums">{money(a.gross)}</span>
                <span className="tabular-nums">{money(a.commission)}</span>
                <span className="tabular-nums">{money(a.net)}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── Panel shell ──────────────────────────────────────────────────────────

const TOOLS = [
  { id: "brief", label: "Brief", Comp: BriefTool },
  { id: "recommendations", label: "Recommendations", Comp: RecommendationsTool },
  { id: "insights", label: "Insights", Comp: InsightsTool },
  { id: "marketing", label: "Marketing", Comp: MarketingTool },
  { id: "pricing", label: "Pricing", Comp: PricingTool },
  { id: "listing", label: "Listing", Comp: ListingTool },
  { id: "accounting", label: "Accounting", Comp: AccountingTool },
] as const

const SellerAiClient = ({
  quota,
  brief,
}: {
  quota: AiQuota | null
  brief: any
}) => {
  const [active, setActive] = useState<(typeof TOOLS)[number]["id"]>("brief")
  const Active = TOOLS.find((t) => t.id === active)!.Comp as React.ElementType

  return (
    <div data-testid="seller-ai-page" className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        AI tools
      </h2>

      {quota && (
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-sm text-ink-muted">
            Free AI actions this month:{" "}
            <span className="font-mono tabular-nums text-ink">
              {quota.used}/{quota.limit}
            </span>{" "}
            used
            {quota.remaining <= 0 && (
              <span className="ml-2 text-rose-600">
                — all used up, unlocks again next month.
              </span>
            )}
          </p>
          {quota.remaining > 0 && quota.limit > 0 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-ink"
                style={{
                  width: `${Math.min(100, (quota.used / quota.limit) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active === t.id
                ? "bg-ink text-white"
                : "border border-ink-strong text-ink hover:bg-ink/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <Active initial={brief} />
      </div>
    </div>
  )
}

export default SellerAiClient