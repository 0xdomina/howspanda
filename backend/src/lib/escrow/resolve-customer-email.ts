import { MedusaRequest } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

// Resolve the authenticated customer's email from the JWT actor. Money-moving
// buyer routes must NEVER trust a client-supplied email as proof of ownership —
// the actor attached by `authenticate("customer", ...)` is the source of truth.
export async function resolveCustomerEmail(
  req: MedusaRequest
): Promise<string> {
  const actorId = (req as any).auth_context?.actor_id
  if (!actorId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Authentication required"
    )
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [customer] } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { id: [actorId] },
  })
  if (!customer?.email) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Authenticated customer not found"
    )
  }
  return customer.email as string
}

// For routes that must keep working for guests (order/escrow/review ownership
// proved by order id + exact checkout email) but should not let an
// authenticated customer act on a stranger's data: when a customer JWT is
// present, return THEIR email (the downstream ownership check then compares
// against the record's email); otherwise return the caller-supplied email.
export async function resolveAuthoritativeEmail(
  req: MedusaRequest,
  fallbackEmail: string
): Promise<string> {
  const actorId = (req as any).auth_context?.actor_id
  if (actorId) {
    return resolveCustomerEmail(req)
  }
  return fallbackEmail.trim().toLowerCase()
}