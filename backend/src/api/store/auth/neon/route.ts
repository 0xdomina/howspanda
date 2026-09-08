import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows"
import { neon } from "@neondatabase/serverless"
import { randomUUID } from "crypto"

// POST /store/auth/neon  { sessionToken }
// Unifies password (Neon) and commerce (Medusa) identity: given a VALID Neon
// session token, this finds-or-creates the Medusa customer + emailpass auth
// identity, links them, and returns a first-party Medusa JWT. The session
// token itself is the credential (verified against the Neon session table,
// expiry enforced) — no password, no OTP, no second account. One code path
// serves brand-new and years-old accounts alike, so all existing data is
// covered the first time each user touches a Medusa-gated flow.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { sessionToken: rawToken } = (req.validatedBody ?? req.body ?? {}) as {
    sessionToken?: string
  }
  // Better Auth signs the cookie as `token.signature`; the session table
  // holds the raw token (first segment). Accept either form.
  const sessionToken =
    typeof rawToken === "string" ? rawToken.split(".")[0] : ""
  if (!sessionToken || sessionToken.length < 10) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid session")
  }
  if (!process.env.DATABASE_URL) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Sign-in is unavailable right now")
  }

  // 1. Validate the Neon session directly (tokens are stored plaintext).
  const sql = neon(process.env.DATABASE_URL)
  const rows = await sql`
    SELECT s."userId" AS "userId", u.email AS email, u.name AS name
    FROM neon_auth."session" s
    JOIN neon_auth."user" u ON u.id = s."userId"
    WHERE s.token = ${sessionToken} AND s."expiresAt" > NOW()
    LIMIT 1
  `.catch(() => [])
  const row = (rows as any[])?.[0]
  const email = typeof row?.email === "string" ? row.email.trim().toLowerCase() : ""
  if (!row || !email) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Session has expired. Please sign in again.")
  }
  const [firstName, ...rest] = (row.name || "").trim().split(/\s+/)
  const lastName = rest.join(" ")

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const auth = req.scope.resolve<any>(Modules.AUTH)

  // 2. Find-or-create the Medusa customer by email.
  const { data: [existingCustomer] } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "first_name", "last_name", "phone"],
    filters: { email },
  })
  let customer = (existingCustomer ?? null) as any

  // 3. Find-or-create the emailpass auth identity.
  const { data: [existingIdentity] } = await query.graph({
    entity: "auth_identity",
    fields: ["id", "app_metadata", "provider_identities.provider", "provider_identities.user_metadata"],
    filters: {
      provider_identities: { provider: "emailpass", entity_id: email },
    },
  })
  let authIdentityId: string | null = (existingIdentity as any)?.id ?? null
  if (!authIdentityId) {
    // Shape mirrors POST /auth/otp/signup: the emailpass provider reads
    // credentials from `body`. Random secret — login always flows through
    // the Neon bridge, never this password.
    const registration = await auth.register("emailpass", {
      body: { email, password: randomUUID() + randomUUID() },
    })
    if (!registration?.success || !registration?.authIdentity?.id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "We could not set up your store login. Please try again."
      )
    }
    authIdentityId = registration.authIdentity.id
  }
  if (!authIdentityId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "We could not set up your store login. Please try again."
    )
  }

  // 4. Ensure the customer record, linked to the identity.
  if (!customer) {
    const { result } = await createCustomerAccountWorkflow(req.scope).run({
      input: {
        authIdentityId,
        customerData: {
          email,
          ...(firstName ? { first_name: firstName } : {}),
          ...(lastName ? { last_name: lastName } : {}),
        },
      },
    })
    customer = result
  } else {
    // Link a pre-existing customer to a fresh identity (older accounts).
    const linked = await query.graph({
      entity: "auth_identity",
      fields: ["id", "app_metadata"],
      filters: { id: [authIdentityId!] },
    })
    const currentMeta = ((linked.data?.[0] as any)?.app_metadata ?? {}) as Record<string, unknown>
    if (currentMeta["customer_id"] !== customer.id) {
      await auth.updateAuthIdentities({
        id: authIdentityId!,
        app_metadata: { ...currentMeta, customer_id: customer.id },
      })
    }
  }

  // 5. Mint a first-party Medusa JWT with the exact claims the emailpass
  // route produces (see generateJwtTokenForAuthIdentity in core).
  const { data: [identity] } = await query.graph({
    entity: "auth_identity",
    fields: ["id", "app_metadata", "provider_identities.provider", "provider_identities.user_metadata"],
    filters: { id: [authIdentityId!] },
  })
  const providerIdentity = ((identity as any)?.provider_identities ?? []).find(
    (pi: any) => pi.provider === "emailpass"
  )
  const config = req.scope.resolve<any>(ContainerRegistrationKeys.CONFIG_MODULE)
  const http = config?.projectConfig?.http ?? {}
  if (!http.jwtSecret) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Sign-in is unavailable right now")
  }
  const token = generateJwtToken(
    {
      actor_id: customer.id,
      actor_type: "customer",
      auth_identity_id: authIdentityId!,
      auth_provider: "emailpass",
      app_metadata: {
        ...(((identity as any)?.app_metadata ?? {}) as Record<string, unknown>),
        customer_id: customer.id,
      },
      user_metadata: providerIdentity?.user_metadata ?? {},
    } as any,
    { secret: http.jwtSecret, expiresIn: http.jwtExpiresIn, jwtOptions: http.jwtOptions } as any
  )

  res.json({
    token,
    customer: {
      id: customer.id,
      email: customer.email,
      first_name: customer.first_name ?? firstName ?? null,
      last_name: customer.last_name ?? lastName ?? null,
    },
  })
}
