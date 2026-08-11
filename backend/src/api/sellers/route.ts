import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import createSellerWorkflow, {
  CreateSellerWorkflowInput,
} from "../../workflows/marketplace/create-seller"
import KycModuleService from "../../modules/kyc/service"
import { KYC_MODULE } from "../../modules/kyc"

export const PostSellerCreateSchema = z.strictObject({
  name: z.string(),
  handle: z.string().optional(),
  logo: z.string().optional(),
  description: z.string().optional(),
  admin: z
    .strictObject({
      email: z.string().email().optional(),
      phone: z.string().min(7).optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
    })
    // A seller signs up with EITHER an email or a phone number; whichever
    // they used IS their verified identifier (KYC never re-verifies it).
    .refine((a) => a.email || a.phone, {
      message: "Provide at least an email or a phone number",
    }),
})

type RequestBody = z.infer<typeof PostSellerCreateSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<RequestBody>,
  res: MedusaResponse
) => {
  // Seller-authenticated actors already administer a store. A customer actor
  // is allowed through this route once to upgrade the same account into a
  // store owner without creating a second login identity.
  if (req.auth_context?.actor_type === "seller" && req.auth_context?.actor_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Request already authenticated as a seller."
    )
  }

  const sellerData = req.validatedBody

  // Creating a store is a ladder-gated action: the user must first reach the
  // current unlock level (phone + complete profile; identity once NIN is on)
  // before they can become a seller. The signup identifier keys the check.
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)
  await kyc.assertLevel({
    email: sellerData.admin.email,
    phone: sellerData.admin.phone,
    userType: req.auth_context?.actor_type === "customer" ? "customer" : null,
    userId: req.auth_context?.actor_type === "customer"
      ? req.auth_context.actor_id
      : null,
    required: kyc.requiredUnlockLevel(),
  })

  const { result } = await createSellerWorkflow(req.scope)
    .run({
      input: {
        ...sellerData,
        authIdentityId: req.auth_context.auth_identity_id,
        preserveCustomerAuth: req.auth_context.actor_type === "customer",
      } as CreateSellerWorkflowInput,
    })

  res.json({
    seller: result.seller,
  })
}
