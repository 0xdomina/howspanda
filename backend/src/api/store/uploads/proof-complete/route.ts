import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { completeProofUpload } from "../../../../lib/bank-transfer/private-proof"

// Buyer proof-of-payment presigned upload (step 2 of 2). Validates the object
// the browser just PUT to the private bucket and returns the internal URI
// that binds the proof to an order via POST /store/orders/:id/bank-proof.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as {
    key?: string
    size?: number
    mime?: string
  }
  if (!body.key || !Number.isInteger(body.size) || !body.mime) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid upload completion details")
  }

  const result = await completeProofUpload({
    key: body.key,
    expectedSize: body.size,
    mime: body.mime,
  })
  if (!result) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Upload was not completed or the file failed validation"
    )
  }

  res.json({ url: result.uri })
}
