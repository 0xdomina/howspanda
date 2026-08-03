"use client"

import { useState, useTransition } from "react"

import { replyToReview, type SellerReview } from "@lib/data/seller"

const Stars = ({ rating }: { rating: number }) => (
  <span className="text-amber-500" aria-label={`${rating} star rating`}>
    {"★".repeat(Math.max(1, Math.min(5, Math.round(rating ?? 0))))}
    <span className="text-ink/20">
      {"★".repeat(5 - Math.max(1, Math.min(5, Math.round(rating ?? 0))))}
    </span>
  </span>
)

const ReplyForm = ({
  reviewId,
  onDone,
}: {
  reviewId: string
  onDone: () => void
}) => {
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    if (!body.trim()) {
      setError("Write a reply.")
      return
    }
    startTransition(async () => {
      const res = await replyToReview(reviewId, body.trim())
      if (res.success) {
        setBody("")
        onDone()
      } else {
        setError(res.error ?? "Could not send the reply.")
      }
    })
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Thanks for the feedback…"
        className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={submit}
        className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Sending…" : "Post reply"}
      </button>
    </div>
  )
}

const ReviewsClient = ({ reviews }: { reviews: SellerReview[] }) => {
  const [filter, setFilter] = useState<"all" | "replied" | "unreplied">("all")

  const filtered = reviews.filter((r) =>
    filter === "all"
      ? true
      : filter === "replied"
        ? !!r.reply_body
        : !r.reply_body
  )

  return (
    <div data-testid="seller-reviews-page" className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Reviews
      </h2>

      <div className="flex items-center gap-2">
        {(["all", "unreplied", "replied"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${
              filter === f ? "bg-ink text-white" : "bg-ink/5 text-ink"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {reviews.length === 0
            ? "No reviews yet. They appear here once buyers review a delivered order."
            : "No reviews in this view."}
        </p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="rounded-large border border-ink-hairline bg-paper-surface p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-sm font-medium text-ink">
                      {r.rating}.0
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink">{r.comment ?? "No comment."}</p>
                  {r.reply_body && (
                    <div className="mt-2 rounded-md bg-ink/5 p-3">
                      <p className="text-xs text-ink-muted">Your reply</p>
                      <p className="mt-0.5 text-sm text-ink">{r.reply_body}</p>
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs text-ink-muted">
                  {r.created_at
                    ? new Date(r.created_at).toLocaleDateString()
                    : ""}
                  {r.status === "removed" && (
                    <span className="mt-1 block text-rose-600">Removed</span>
                  )}
                </div>
              </div>
              {!r.reply_body && <ReplyForm reviewId={r.id} onDone={() => {}} />}
              {r.reply_body && (
                <p className="mt-2 text-xs text-ink-muted">
                  Replied{" "}
                  {r.replied_at
                    ? new Date(r.replied_at).toLocaleString()
                    : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ReviewsClient