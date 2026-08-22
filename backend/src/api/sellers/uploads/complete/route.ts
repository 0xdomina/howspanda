import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { completeMediaUpload } from "../../../../lib/media/upload"

type Body = {
  key?: string
  kind?: "image" | "video"
  size?: number
}

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.body ?? {}
  if (!body.key || (body.kind !== "image" && body.kind !== "video") || !Number.isInteger(body.size)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid media completion details")
  }

  res.json(await completeMediaUpload({
    ownerId: req.auth_context.actor_id,
    key: body.key,
    kind: body.kind,
    expectedSize: body.size!,
  }))
}
