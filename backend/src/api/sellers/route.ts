import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import createSellerWorkflow, {
  CreateSellerWorkflowInput,
} from "../../workflows/marketplace/create-seller"

export const PostSellerCreateSchema = z.strictObject({
  name: z.string(),
  handle: z.string(),
  logo: z.string().optional(),
  description: z.string().optional(),
  admin: z.strictObject({
    email: z.string().email(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
})

type RequestBody = z.infer<typeof PostSellerCreateSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<RequestBody>,
  res: MedusaResponse
) => {
  // If `actor_id` is present, the request is already authenticated
  // as an existing seller admin
  if (req.auth_context?.actor_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Request already authenticated as a seller."
    )
  }

  const sellerData = req.validatedBody

  const { result } = await createSellerWorkflow(req.scope)
    .run({
      input: {
        ...sellerData,
        authIdentityId: req.auth_context.auth_identity_id,
      } as CreateSellerWorkflowInput,
    })

  res.json({
    seller: result.seller,
  })
}
