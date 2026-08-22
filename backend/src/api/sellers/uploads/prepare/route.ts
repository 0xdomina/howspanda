import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { prepareMediaUpload } from "../../../../lib/media/upload"

type Body = {
  kind?: "image" | "video"
  mime?: string
  size?: number
}

const MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/quicktime",
])

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.body ?? {}
  if ((body.kind !== "image" && body.kind !== "video") || !body.mime || !MIME_TYPES.has(body.mime) || !Number.isInteger(body.size)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid media upload details")
  }

  const prepared = await prepareMediaUpload({
    ownerId: req.auth_context.actor_id,
    kind: body.kind,
    mime: body.mime,
    size: body.size!,
  })
  res.json(prepared)
}
