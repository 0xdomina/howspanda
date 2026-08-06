import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import { resolveSellerContext } from "../../../../lib/sellers/resolve-seller"

// Owner-only removal of a staff member. The staff login is revoked (auth
// identity deleted) and the seller_admin row is removed.
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await resolveSellerContext(req)
  if (context.role !== "owner") {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Only the store owner can manage the team."
    )
  }

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)

  const memberId = req.params.id as string

  const [member] = await marketplace.listSellerAdmins({
    id: memberId,
    seller_id: context.sellerId,
  })
  if (!member) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Team member not found in this store."
    )
  }
  if (member.role === "owner") {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "The store owner cannot be removed."
    )
  }

  // Drop the seller actor link, then revoke the login entirely.
  if (member.auth_identity_id) {
    try {
      const auth = req.scope.resolve(Modules.AUTH)
      const authIdentity = await auth.retrieveAuthIdentity(
        member.auth_identity_id
      )
      const appMetadata = authIdentity.app_metadata ?? {}
      delete appMetadata["seller_id"]
      await auth.updateAuthIdentities({
        id: member.auth_identity_id,
        app_metadata: appMetadata,
      })
      await auth.deleteAuthIdentities([member.auth_identity_id])
    } catch (error) {
      // The identity may already be gone; the row removal still proceeds.
    }
  }

  await marketplace.deleteSellerAdmins(memberId)

  res.json({ ok: true, id: memberId })
}
