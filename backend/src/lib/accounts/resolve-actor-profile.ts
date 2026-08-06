import { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveSellerContext } from "../sellers/resolve-seller"

// A person's display name is their real profile name (first + last), never a
// string derived from their email. This resolver reads the authenticated
// actor's profile name so callers (courier apply, chat, etc.) can show the
// proper name platform-wide without exposing any part of the email.
const joinName = (...parts: (string | null | undefined)[]): string | null => {
  const joined = parts
    .filter(Boolean)
    .map((p) => (p as string).trim())
    .filter(Boolean)
    .join(" ")
    .trim()
  return joined || null
}

export async function resolveActorProfile(
  req: MedusaRequest
): Promise<{ name: string | null; phone: string | null }> {
  const auth = (req as any).auth_context as
    | { actor_id?: string; actor_type?: string }
    | undefined

  if (!auth?.actor_id) {
    return { name: null, phone: null }
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  if (auth.actor_type === "customer") {
    const { data: [customer] } = await query.graph({
      entity: "customer",
      fields: ["first_name", "last_name", "phone"],
      filters: { id: [auth.actor_id] },
    })
    return {
      name: joinName(customer?.first_name, customer?.last_name),
      phone: customer?.phone ?? null,
    }
  }

  if (auth.actor_type === "seller") {
    const ctx = await resolveSellerContext(req as any)
    const { data: [admin] } = await query.graph({
      entity: "seller_admin",
      fields: ["first_name", "last_name", "phone"],
      filters: { id: [ctx.sellerAdminId] },
    })
    return {
      name: joinName(admin?.first_name, admin?.last_name),
      phone: admin?.phone ?? null,
    }
  }

  return { name: null, phone: null }
}
