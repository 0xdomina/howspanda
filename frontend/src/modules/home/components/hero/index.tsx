import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => {
  return (
    <section className="relative w-full overflow-hidden bg-paper-tinted">
      <div className="content-container flex min-h-[60vh] flex-col justify-center gap-6 py-16 small:py-24">
        <span className="eyebrow text-ink-muted">Sell what you have. Deliver what you buy.</span>
        <h1 className="max-w-2xl font-display text-4xl font-medium leading-[1.05] tracking-[-0.02em] text-ink small:text-6xl">
          How&rsquo;s u. Where informal trade gets paid on time.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-ink-muted">
          Buy from people, sell what you make, and earn for every delivery you complete.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <LocalizedClientLink href="/store">
            <span className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper-surface transition-colors duration-fast hover:bg-ink/90">
              Start shopping
            </span>
          </LocalizedClientLink>
          <LocalizedClientLink href="/account">
            <span className="inline-flex items-center rounded-full border border-ink-hairline bg-paper-surface px-6 py-3 text-sm font-medium text-ink transition-colors duration-fast hover:bg-paper-tinted">
              Start selling
            </span>
          </LocalizedClientLink>
        </div>
      </div>
    </section>
  )
}

export default Hero