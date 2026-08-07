import { MedusaError } from "@medusajs/framework/utils"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import MallModuleService from "../../../../../modules/mall/service"
import { MALL_MODULE } from "../../../../../modules/mall"
import { resolveActorEmail } from "../../../../../lib/accounts/resolve-actor-email"

// Buyers join a mall with their email. When the caller is signed in, the email
// is derived from the authenticated actor (never trusted from the body — a
// session cannot be used to inflate counts for another identity). Guests keep
// the email-ownership flow used across the platform (the email must match a
// real order to earn a ticket later).
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { buyerEmail?: string }

  let buyerEmail = body?.buyerEmail?.trim()
  if (req.auth_context?.actor_id) {
    buyerEmail = await resolveActorEmail(req)
  }
  if (!buyerEmail) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "buyerEmail is required"
    )
  }

  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const buyer = await mallService.joinAsBuyer({
    mallId: id,
    buyerEmail,
  })

  res.status(201).json({ buyer })
}
