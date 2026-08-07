import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  isDefined,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { resolveSellerContext } from "../../../lib/sellers/resolve-seller"
import { sendTeamInviteEmail } from "../../../lib/notifications/send-team-invite"

const normalizeEmail = (email: string) => email.trim().toLowerCase()

// Team invitation: the owner adds an EXISTING platform user to the store. No
// credentials are provisioned here (the invitee logs in with the password they
// already own) and no KYC is seeded — the invitee's own verification flow runs
// when they act on the store. The only requirement is that the invited email
// already holds a platform account.
export const PostSellerTeamSchema = z.strictObject({
  email: z.string().email(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
})

type TeamMember = {
  id: string
  role: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  created_at: string | null
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await resolveSellerContext(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: admins } = await query.graph({
    entity: "seller_admin",
    fields: [
      "id",
      "role",
      "first_name",
      "last_name",
      "email",
      "phone",
      "created_at",
    ],
    filters: { seller_id: [context.sellerId] },
  })

  const team: TeamMember[] = (admins ?? []).map((admin: any) => ({
    id: admin.id,
    role: admin.role ?? "owner",
    first_name: admin.first_name ?? null,
    last_name: admin.last_name ?? null,
    email: admin.email ?? null,
    phone: admin.phone ?? null,
    created_at: admin.created_at ?? null,
  }))

  res.json({ team })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<z.infer<typeof PostSellerTeamSchema>>,
  res: MedusaResponse
) => {
  const context = await resolveSellerContext(req)
  if (context.role !== "owner") {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Only the store owner can manage the team."
    )
  }

  const body = req.validatedBody
  const email = normalizeEmail(body.email)

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)

  // The teammate must not already hold a store account (owner or another
  // store's staff) — one email = one store identity.
  const existing = await marketplace.listSellerAdmins(
    { email },
    { take: 1 }
  )
  if (existing.length) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "That email already belongs to a store account."
    )
  }

  const auth = req.scope.resolve(Modules.AUTH)

  // Invite existing platform users only — the invited email must already hold
  // an account on the platform. We never provision a new login here.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "auth_identity",
    fields: [
      "id",
      "app_metadata",
      "provider_identities.provider",
      "provider_identities.entity_id",
    ],
    filters: {
      provider_identities: { entity_id: email },
    },
  })

  const identity = (data ?? []).find(
    (i: any) =>
      (i.provider_identities ?? []).some(
        (p: any) => p.provider === "emailpass"
      )
  )
  if (!identity) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No existing platform account was found for that email. Only existing users can be invited."
    )
  }

  // The invitee must not already run (or staff) a store.
  if (isDefined(identity.app_metadata?.seller_id)) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "That account is already attached to a store."
    )
  }

  const staffAdmin = await marketplace.createSellerAdmins({
    seller_id: context.sellerId,
    role: "staff",
    auth_identity_id: identity.id,
    email,
    first_name: body.first_name,
    last_name: body.last_name,
  })

  // Attach the seller actor to the invitee's EXISTING identity so they sign in
  // to /seller with the credentials they already own. Any prior app_metadata
  // (e.g. a customer binding) is preserved.
  const authMetadata = await auth.retrieveAuthIdentity(identity.id)
  const appMetadata = authMetadata.app_metadata ?? {}
  appMetadata["seller_id"] = staffAdmin.id
  await auth.updateAuthIdentities({
    id: identity.id,
    app_metadata: appMetadata,
  })

  // Fire-and-forget invite email. A mail failure must never undo the invite.
  await (async () => {
    try {
      const { data: sellerRows } = await query.graph({
        entity: "seller",
        fields: ["name"],
        filters: { id: context.sellerId },
      })
      const storeName = sellerRows?.[0]?.name ?? "your store"
      await sendTeamInviteEmail(req.scope, { to: email, storeName })
    } catch {
      // Best-effort only — the invite itself has already succeeded.
    }
  })()

  res.json({
    team_member: {
      id: staffAdmin.id,
      role: staffAdmin.role,
      email,
      first_name: staffAdmin.first_name,
      last_name: staffAdmin.last_name,
    },
  })
}
