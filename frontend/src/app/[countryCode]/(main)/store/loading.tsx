export default function StoreLoading() {
  return (
    <div className="figma-container py-10" aria-live="polite" aria-label="Loading store">
      <div className="h-8 w-48 animate-pulse rounded-control bg-ink/10" />
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 small:grid-cols-4 small:gap-x-7">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="aspect-[9/11] animate-pulse rounded-control bg-ink/5" />
            <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-ink/10" />
            <div className="mt-1.5 h-4 w-1/3 animate-pulse rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </div>
  )
}
