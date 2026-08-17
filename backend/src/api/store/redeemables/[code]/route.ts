import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { REDEEMABLES_MODULE } from "../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../modules/redeemables/service"

// Public validity check — what the buyer's (or door staff's) phone shows.
// Unknown codes 404, dead/expired codes 400, via the shared error mapping.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
  const redeemable = await redeemables.getUsableByCode(req.params.code)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: ["name", "handle"],
    filters: { id: redeemable.seller_id },
  })

  res.json({
    redeemable: {
      type: redeemable.type,
      title: redeemable.title,
      design_variant: redeemable.design_variant,
      background_image: redeemable.background_image,
      accent_color: redeemable.accent_color,
      message: redeemable.message,
      event_name: redeemable.event_name,
      venue_name: redeemable.venue_name,
      venue_address: redeemable.venue_address,
      event_starts_at: redeemable.event_starts_at,
      event_ends_at: redeemable.event_ends_at,
      status: redeemable.status,
      currency_code: redeemable.currency_code,
      face_value: redeemable.face_value,
      balance: redeemable.balance,
      discount_type: redeemable.discount_type,
      discount_value: redeemable.discount_value,
      expires_at: redeemable.expires_at,
      qr_payload: redeemable.code,
      store: seller ? { name: seller.name, handle: seller.handle } : null,
    },
  })
}
