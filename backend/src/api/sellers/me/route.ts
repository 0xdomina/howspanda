import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "first_name", "last_name", "email", "seller.*"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  if (!sellerAdmin) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  const kycProfile = await kyc.getProfileView(sellerAdmin.email)

  res.json({
    seller_admin: sellerAdmin,
    kyc: kycProfile,
  })
}
