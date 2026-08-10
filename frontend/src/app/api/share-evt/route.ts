import { NextRequest, NextResponse } from "next/server"

const ALLOWED_CHANNELS = new Set([
  "whatsapp",
  "x",
  "facebook",
  "linkedin",
  "telegram",
  "pinterest",
  "sms",
  "email",
  "copy",
  "native",
])

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { entity, entityId, channel } = (body ?? {}) as {
    entity?: unknown
    entityId?: unknown
    channel?: unknown
  }

  if (
    typeof entity !== "string" ||
    entity.length === 0 ||
    entity.length > 64 ||
    (entityId != null &&
      (typeof entityId !== "string" || entityId.length > 128)) ||
    typeof channel !== "string" ||
    !ALLOWED_CHANNELS.has(channel)
  ) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  console.log(
    `[share-evt] entity=${entity} entityId=${entityId ?? "-"} channel=${channel}`
  )

  return NextResponse.json({ ok: true }, { status: 200 })
}
