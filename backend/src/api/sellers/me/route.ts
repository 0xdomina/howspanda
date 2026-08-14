import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { resolveSellerContext } from "../../../lib/sellers/resolve-seller"

// Store settings + profile. Store identity fields (name/handle/logo/description)
// are owner-only; everyone can update their own name.
export const PatchSellerMeSchema = z.strictObject({
  name: z.string().min(2).optional(),
  handle: z.string().min(2).optional(),
  logo: z.string().url().nullable().optional(),
  cover_image: z.string().url().nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  theme: z.enum(["sunset", "midnight", "mint", "candy", "cobalt"]).optional(),
  // Owner-only store payment switch: OFF closes the crypto-usdc rail for this
  // seller (no crypto session can be created against their products).
  crypto_payments_enabled: z.boolean().optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
})

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)

  const context = await resolveSellerContext(req)
  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: [
      "id",
      "first_name",
      "last_name",
      "email",
      "phone",
      "role",
      "permissions",
      "seller.*",
    ],
    filters: { id: [context.sellerAdminId] },
  })

  if (!sellerAdmin) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  const kycProfile = await kyc.getProfileView({
    userType: "seller",
    userId: sellerAdmin.id,
    email: sellerAdmin.email,
    phone: sellerAdmin.phone,
  })

  res.json({
    seller_admin: {
      ...sellerAdmin,
      permissions: context.permissions,
    },
    kyc: kycProfile,
  })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<z.infer<typeof PatchSellerMeSchema>>,
  res: MedusaResponse
) => {
  const context = await resolveSellerContext(req)
  const body = req.validatedBody

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)

  const storeFields: Partial<{
    name: string
    handle: string
    logo: string | null
    cover_image: string | null
    description: string | null
    accent_color: string
    theme: string
    crypto_payments_enabled: boolean
  }> = {}
  if (body.name !== undefined) storeFields.name = body.name
  if (body.handle !== undefined) storeFields.handle = body.handle
  if (body.logo !== undefined) storeFields.logo = body.logo
  if (body.cover_image !== undefined) storeFields.cover_image = body.cover_image
  if (body.description !== undefined) storeFields.description = body.description
  if (body.accent_color !== undefined) storeFields.accent_color = body.accent_color
  if (body.theme !== undefined) storeFields.theme = body.theme
  if (body.crypto_payments_enabled !== undefined) {
    storeFields.crypto_payments_enabled = body.crypto_payments_enabled
  }

  if (Object.keys(storeFields).length > 0) {
    if (context.role !== "owner") {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Only the store owner can update store settings."
      )
    }
    try {
      await marketplace.updateSellers({
        id: context.sellerId,
        ...storeFields,
      })
    } catch (error: any) {
      if (error?.type === MedusaError.Types.INVALID_DATA) {
        throw error
      }
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "That store handle is already taken."
      )
    }
  }

  const profileFields: Partial<{
    first_name: string
    last_name: string
  }> = {}
  if (body.first_name !== undefined) profileFields.first_name = body.first_name
  if (body.last_name !== undefined) profileFields.last_name = body.last_name

  if (Object.keys(profileFields).length > 0) {
    await marketplace.updateSellerAdmins({
      id: context.sellerAdminId,
      ...profileFields,
    })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [updatedAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: [
      "id",
      "first_name",
      "last_name",
      "email",
      "phone",
      "role",
      "permissions",
      "seller.*",
    ],
    filters: {
      id: [context.sellerAdminId],
    },
  })

  res.json({
    seller_admin: {
      ...updatedAdmin,
      permissions: context.permissions,
    },
  })
}
