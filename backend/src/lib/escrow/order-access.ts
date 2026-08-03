import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { resolveCustomerEmail } from "./resolve-customer-email"
import { MedusaRequest } from "@medusajs/framework/http"

// Guest checkout: possession of the high-entropy order id + the exact checkout
// email is the ownership proof. Defense-in-depth: if the caller IS an
// authenticated customer, we additionally require their JWT email to match the
// order email (returning the authenticated email so routes never trust the
// body). Guests without a session fall back to the email they supply.
export async function assertOrderEmail(
  container: MedusaContainer,
  orderId: string,
  email: string,
  req?: MedusaRequest
): Promise<{ email: string }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "email"],
    filters: { id: orderId },
  })
  const order = data[0]
  if (
    !order ||
    (order.email ?? "").toLowerCase() !== email.trim().toLowerCase()
  ) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  }

  if ((req as any)?.auth_context?.actor_id) {
    const authedEmail = await resolveCustomerEmail(req!)
    if (
      authedEmail.trim().toLowerCase() !== (order.email as string).toLowerCase()
    ) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "This order is not associated with your account"
      )
    }
    return { email: authedEmail }
  }

  return { email: email.trim().toLowerCase() }
}