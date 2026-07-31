import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

// No buyer accounts yet (guest checkout): possession of the high-entropy
// order id + the exact checkout email is the ownership proof. The frontend
// phase upgrades this to customer JWT without changing route semantics.
export async function assertOrderEmail(
  container: MedusaContainer,
  orderId: string,
  email: string
) {
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
  return order
}
