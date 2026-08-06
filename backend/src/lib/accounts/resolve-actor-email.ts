import { MedusaRequest } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { resolveSellerContext } from "../sellers/resolve-seller"

// Resolve the authenticated actor's email from the JWT actor. Courier actions
// (offers, pickup) must NEVER trust a client-supplied email as proof of
// identity — the actor attached by `authenticate([...], ...)` is the source
// of truth. Both customer and seller accounts can courier.
export async function resolveActorEmail(req: MedusaRequest): Promise<string> {
  const auth = (req as any).auth_context as
    | { actor_id?: string; actor_type?: string }
    | undefined

  if (!auth?.actor_id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Authentication required"
    )
  }

  if (auth.actor_type === "seller") {
    const ctx = await resolveSellerContext(req as any)
    if (!ctx.email) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Seller account has no email"
      )
    }
    return ctx.email
  }

  if (auth.actor_type === "customer") {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: [customer] } = await query.graph({
      entity: "customer",
      fields: ["id", "email"],
      filters: { id: [auth.actor_id] },
    })
    if (!customer?.email) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Authenticated customer not found"
      )
    }
    return (customer.email as string).trim().toLowerCase()
  }

  throw new MedusaError(
    MedusaError.Types.UNAUTHORIZED,
    "Sign in with a customer or seller account to courier"
  )
}
