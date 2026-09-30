import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Build identity for the deploy watchdog: when this changes under a running
// tab, the client hard-reloads onto the new deployment instead of running
// stale chunks against new routes.
export async function GET() {
  return NextResponse.json(
    {
      build:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
        process.env.NEXT_PUBLIC_BUILD_ID ??
        "local",
    },
    { headers: { "cache-control": "no-store" } }
  )
}
