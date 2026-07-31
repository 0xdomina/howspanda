import { model } from "@medusajs/framework/utils"
import Redemption from "./redemption"

// Store-scoped bearer instruments (Phase 7). Classic semantics:
//   gift_card — stored value; balance draws down across redemptions to 0
//   voucher   — one-shot discount (fixed amount or percent), dies on first use
//   ticket    — one-shot admission (door/venue), never usable at checkout
// `price` set ⇒ purchasable template: sales mint FRESH coded instances;
// `price` null ⇒ gift/free-issue instrument.
const Redeemable = model.define("redeemable", {
  id: model.id().primaryKey(),
  seller_id: model.text(),
  type: model.enum(["gift_card", "voucher", "ticket"]),
  code: model.text().unique(),
  status: model
    .enum(["active", "redeemed", "cancelled", "expired"])
    .default("active"),
  currency_code: model.text().default("ngn"),
  title: model.text(),
  face_value: model.bigNumber().nullable(),
  balance: model.bigNumber().nullable(),
  discount_type: model.enum(["fixed", "percent"]).nullable(),
  discount_value: model.float().nullable(),
  price: model.bigNumber().nullable(),
  product_id: model.text().nullable(),
  expires_at: model.dateTime().nullable(),
  issued_to_email: model.text().nullable(),
  source_order_id: model.text().nullable(),
  redemptions: model.hasMany(() => Redemption, {
    mappedBy: "redeemable",
  }),
})

export default Redeemable
