import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { PUBLIC_PRODUCTS_TAG } from "@lib/data/cache"

export const dynamic = "force-dynamic"

// Ops escape hatch: bust the shared catalog (and friends) after direct data
// repairs that bypass app mutations. Secret-gated; never linked in UI.
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) {
    return NextResponse.json({ error: "disabled" }, { status: 404 })
  }
  let body: { secret?: string; tag?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 })
  }
  if (body.secret !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  const tag = body.tag || PUBLIC_PRODUCTS_TAG
  revalidateTag(tag, "max")
  return NextResponse.json({ ok: true, tag })
}
