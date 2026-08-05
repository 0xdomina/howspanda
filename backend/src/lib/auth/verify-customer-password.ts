import {
  ContainerRegistrationKeys,
  MedusaError,
  isString,
} from "@medusajs/framework/utils"
import scryptKdf from "scrypt-kdf"

type Container = { resolve: <T>(key: string) => T }

type AuthIdentity = {
  id: string
  entity_id: string
  provider: string
  provider_identities?: Array<{
    provider?: string
    provider_metadata?: { password?: string }
  }>
}

// Re-auth gate for money-moving customer routes: the caller must prove they
// know their account password AGAIN before an external USDC send can leave
// their managed wallet. The identity is resolved from the authenticated actor
// (auth_identity.app_metadata.customer_id) — never from anything the client
// supplies — and the password is verified against the stored scrypt hash
// exactly like the emailpass / phone login providers.
export async function verifyCustomerPassword(
  container: Container,
  actorId: string,
  password: string
): Promise<boolean> {
  if (!isString(password) || password.length === 0) {
    return false
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  let identities: AuthIdentity[] = []
  try {
    const { data } = await query.graph({
      entity: "auth_identity",
      fields: [
        "id",
        "entity_id",
        "provider",
        "provider_identities.provider",
        "provider_identities.provider_metadata",
      ],
      filters: { app_metadata: { customer_id: actorId } },
    })
    identities = data as AuthIdentity[]
  } catch (e) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Could not resolve the customer's auth identity"
    )
  }

  for (const identity of identities) {
    const providerIdentity = (identity.provider_identities ?? []).find(
      (pi) => pi.provider === "emailpass" || pi.provider === "phone"
    )
    const passwordHash = providerIdentity?.provider_metadata?.password
    if (!isString(passwordHash)) {
      continue
    }
    try {
      const buf = Buffer.from(passwordHash, "base64")
      if (await scryptKdf.verify(buf, password)) {
        return true
      }
    } catch {
      // Corrupt/unreadable hash — fall through and try the next identity.
    }
  }

  return false
}
