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
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"
import { resolveSellerContext } from "../../../lib/sellers/resolve-seller"

const normalizeEmail = (email: string) => email.trim().toLowerCase()

// Staff signup: the owner provisions a login for an employee. The email is
// NOT proven by the staff member here (the owner types it in), so we do NOT
// seed it as a verified KYC identifier — the new teammate completes their own
// profile/KYC once they sign in. The login itself is enough to use the store
// dashboard.
export const PostSellerTeamSchema = z.strictObject({
  email: z.string().email(),
  password: z.string().min(8),
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

  const registered = await auth.register("emailpass", {
    body: { email, password: body.password },
  })
  if (!registered.success || !registered.authIdentity) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      registered.error ?? "Could not create the staff login."
    )
  }
  const authIdentityId = registered.authIdentity.id

  const staffAdmin = await marketplace.createSellerAdmins({
    seller_id: context.sellerId,
    role: "staff",
    auth_identity_id: authIdentityId,
    email,
    first_name: body.first_name,
    last_name: body.last_name,
  })

  // Attach the seller actor to the new auth identity so the staff member can
  // sign in to /seller with their own credentials.
  const authIdentity = await auth.retrieveAuthIdentity(authIdentityId)
  const appMetadata = authIdentity.app_metadata ?? {}
  if (isDefined(appMetadata["seller_id"])) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "That login is already attached to a store."
    )
  }
  appMetadata["seller_id"] = staffAdmin.id
  await auth.updateAuthIdentities({
    id: authIdentityId,
    app_metadata: appMetadata,
  })

  // The staff email is not auto-KYC-verified (see above); seed a bare profile
  // so their in-app verification flow has somewhere to write to.
  const kyc: KycModuleService = req.scope.resolve(KYC_MODULE)
  await kyc.getOrCreateProfile({ email, phone: undefined })

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
