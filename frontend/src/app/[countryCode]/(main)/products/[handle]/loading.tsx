export default function ProductLoading() {
  return (
    <div className="figma-container py-10" aria-live="polite" aria-label="Loading product">
      <div className="grid grid-cols-1 gap-8 small:grid-cols-2 small:gap-12">
        <div className="aspect-[9/11] animate-pulse rounded-control bg-ink/5" />
        <div className="flex flex-col gap-4">
          <div className="h-8 w-3/4 animate-pulse rounded-control bg-ink/10" />
          <div className="h-6 w-1/3 animate-pulse rounded bg-ink/10" />
          <div className="h-20 w-full animate-pulse rounded-control bg-ink/5" />
          <div className="h-12 w-full animate-pulse rounded-control bg-ink/10" />
        </div>
      </div>
    </div>
  )
}
