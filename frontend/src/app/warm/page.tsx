import WarmAgent from "@modules/common/components/warm-agent"

export const dynamic = "force-dynamic"

export const metadata = {
  robots: { index: false, follow: false },
  title: "Warm — How's u",
}

export default function WarmPage() {
  return (
    <div className="figma-container py-16">
      <h1 className="text-sm font-semibold text-ink-muted">Backend warm loop</h1>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        This page keeps PandaStack warm: 2 min active (hit every 20s) then 3 min sleep, on loop. Keep a tab open or let the hidden WarmAgent in the main layout do it. Not indexed.
      </p>
      <WarmAgent />
      <p className="mt-6 text-xs text-ink-muted">B2 stays private — media uses 30-day presigned URLs refreshed 3 days before expiry.</p>
    </div>
  )
}
