import { Metadata } from "next"

export const metadata: Metadata = { title: "About", description: "Learn more about How’s U." }

export default function AboutPage() {
  return (
    <main className="figma-container grid gap-12 py-16 small:grid-cols-2 small:items-center small:py-24">
      <div><p className="text-sm font-semibold text-brand">Our Story</p><h1 className="mt-4 font-display text-5xl font-semibold tracking-tight">A better way to buy and sell locally.</h1><div className="mt-8 space-y-5 text-base leading-7 text-ink-muted"><p>How’s U is Nigeria’s marketplace for people who make, source, deliver, and shop.</p><p>We help informal sellers turn what they already know into a business, while buyers get a more human way to discover products.</p></div></div>
      <div className="min-h-[420px] rounded-control bg-[#f5f5f5] p-8"><div className="flex h-full items-end rounded-control bg-black p-8 text-white"><div><p className="text-sm text-white/60">How’s U</p><p className="mt-3 font-display text-4xl">Shop more.<br />Sell more.</p></div></div></div>
    </main>
  )
}
