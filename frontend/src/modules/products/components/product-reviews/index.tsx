import type { ProductRatingSummary } from "@lib/data/reviews"

const Stars = ({ rating }: { rating: number }) => {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <span className="text-amber-500" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rounded)}
      <span className="text-ink/15">{"★".repeat(5 - rounded)}</span>
    </span>
  )
}

const ProductReviews = ({ summary }: { summary: ProductRatingSummary }) => (
  <section className="figma-container mb-16 small:mb-24" aria-labelledby="reviews-heading">
    <div className="border-t border-ink-hairline pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-heading" className="font-display text-2xl font-medium text-ink">
            Product reviews
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {summary.count
              ? `${summary.count} verified buyer review${summary.count === 1 ? "" : "s"}`
              : "No reviews yet"}
          </p>
        </div>
        {summary.count > 0 && (
          <div className="flex items-center gap-2 text-sm text-ink">
            <Stars rating={summary.average} />
            <span className="font-medium">{summary.average.toFixed(1)} / 5</span>
          </div>
        )}
      </div>

      {summary.reviews.length > 0 && (
        <ul className="mt-6 grid gap-4 small:grid-cols-2">
          {summary.reviews.map((review) => (
            <li key={review.id} className="rounded-large border border-ink-hairline bg-paper-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <Stars rating={review.rating} />
                <span className="text-xs text-ink-muted">
                  {new Date(review.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-2 text-xs font-medium text-ink">{review.name}</p>
              {review.comment && <p className="mt-2 text-sm text-ink">{review.comment}</p>}
              {review.reply_body && (
                <div className="mt-3 rounded-medium bg-ink/5 p-3">
                  <p className="text-xs font-medium text-ink-muted">Store reply</p>
                  <p className="mt-1 text-sm text-ink">{review.reply_body}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  </section>
)

export default ProductReviews
