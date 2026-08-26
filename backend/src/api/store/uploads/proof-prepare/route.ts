import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  hasPrivatePaymentProofStorage,
  prepareProofUpload,
} from "../../../../lib/bank-transfer/private-proof"

// Buyer proof-of-payment presigned upload (step 1 of 2). Returns a short-lived
// presigned PUT URL for the private bucket — the browser uploads directly to
// B2, bypassing the API, so Cloudflare's managed challenge on multipart
// POSTs to the backend never blocks a buyer.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { mime?: string; size?: number }
  if (
    !hasPrivatePaymentProofStorage() ||
    !body.mime ||
    !Number.isInteger(body.size)
  ) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid upload details")
  }

  const prepared = await prepareProofUpload({
    mime: body.mime,
    size: body.size,
  })
  if (!prepared) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Upload a valid image (PNG, JPEG, or WebP) up to 10MB"
    )
  }

  res.json(prepared)
}
