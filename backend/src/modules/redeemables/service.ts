import { randomBytes } from "node:crypto"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Redeemable from "./models/redeemable"
import Redemption from "./models/redemption"

export type RedeemableType = "gift_card" | "voucher" | "ticket"

export type MintInput = {
  seller_id: string
  type: RedeemableType
  title: string
  design_variant?: string
  background_image?: string | null
  accent_color?: string | null
  message?: string | null
  event_name?: string | null
  venue_name?: string | null
  venue_address?: string | null
  event_starts_at?: Date | null
  event_ends_at?: Date | null
  currency_code?: string
  face_value?: number
  discount_type?: "fixed" | "percent"
  discount_value?: number
  price?: number
  product_id?: string
  expires_at?: Date
  issued_to_email?: string
  source_order_id?: string
}

// Unambiguous alphabet: no 0/O/1/I (and no L — reads as 1 in some fonts)
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_PREFIX: Record<RedeemableType, string> = {
  gift_card: "GC",
  voucher: "VC",
  ticket: "TK",
}

function generateCode(type: RedeemableType): string {
  const bytes = randomBytes(12)
  const chars = Array.from(
    bytes,
    (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]
  )
  const groups = [
    chars.slice(0, 4).join(""),
    chars.slice(4, 8).join(""),
    chars.slice(8, 12).join(""),
  ]
  return `${CODE_PREFIX[type]}-${groups.join("-")}`
}

class RedeemablesModuleService extends MedusaService({
  Redeemable,
  Redemption,
}) {
  // ── creation ────────────────────────────────────────────────────────────

  /** Validates per-type rules and mints `quantity` coded instances. */
  async mintRedeemables(input: MintInput, quantity = 1) {
    if (quantity < 1 || quantity > 100) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "quantity must be between 1 and 100"
      )
    }
    if (input.type === "voucher") {
      if (!input.discount_type || !input.discount_value) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Vouchers need discount_type and discount_value"
        )
      }
      if (
        input.discount_type === "percent" &&
        (input.discount_value <= 0 || input.discount_value > 100)
      ) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Percent vouchers must be between 1 and 100"
        )
      }
    } else if (!input.face_value || input.face_value <= 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `${input.type === "gift_card" ? "Gift cards" : "Tickets"} need a positive face_value`
      )
    }

    if (
      input.type === "ticket" &&
      input.event_starts_at &&
      input.event_ends_at &&
      input.event_ends_at <= input.event_starts_at
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "A ticket end time must be after its start time"
      )
    }

    const rows = Array.from({ length: quantity }, () => ({
      seller_id: input.seller_id,
      type: input.type,
      code: generateCode(input.type),
      currency_code: input.currency_code ?? "ngn",
      title: input.title,
      design_variant: input.design_variant ?? "sunset",
      background_image: input.background_image ?? null,
      accent_color: input.accent_color ?? null,
      message: input.message ?? null,
      event_name: input.event_name ?? null,
      venue_name: input.venue_name ?? null,
      venue_address: input.venue_address ?? null,
      event_starts_at: input.event_starts_at ?? null,
      event_ends_at: input.event_ends_at ?? null,
      face_value: input.face_value ?? null,
      balance: input.type === "gift_card" ? input.face_value : null,
      discount_type: input.discount_type ?? null,
      discount_value: input.discount_value ?? null,
      price: input.price ?? null,
      product_id: input.product_id ?? null,
      expires_at: input.expires_at ?? null,
      issued_to_email: input.issued_to_email?.trim().toLowerCase() ?? null,
      source_order_id: input.source_order_id ?? null,
    }))
    return await this.createRedeemables(rows)
  }

  /** A sold template mints a FRESH instance per unit to the buyer. */
  async mintFromTemplate(
    templateId: string,
    opts: { quantity: number; issued_to_email?: string; source_order_id: string }
  ) {
    const template = await this.retrieveRedeemable(templateId)
    return await this.mintRedeemables(
      {
        seller_id: template.seller_id,
        type: template.type as RedeemableType,
        title: template.title,
        design_variant: template.design_variant,
        background_image: template.background_image,
        accent_color: template.accent_color,
        message: template.message,
        event_name: template.event_name,
        venue_name: template.venue_name,
        venue_address: template.venue_address,
        event_starts_at: template.event_starts_at,
        event_ends_at: template.event_ends_at,
        currency_code: template.currency_code,
        face_value: template.face_value
          ? Number(template.face_value)
          : undefined,
        discount_type:
          (template.discount_type as "fixed" | "percent") ?? undefined,
        discount_value: template.discount_value ?? undefined,
        expires_at: template.expires_at ?? undefined,
        issued_to_email: opts.issued_to_email,
        source_order_id: opts.source_order_id,
      },
      opts.quantity
    )
  }

  // ── lookup & validation ─────────────────────────────────────────────────

  /**
   * Fetches by code with lazy expiry, optional seller scoping (foreign codes
   * are invisible — 404, never 400) and a usability gate.
   */
  async getUsableByCode(code: string, opts: { seller_id?: string } = {}) {
    const [redeemable] = await this.listRedeemables({ code })
    if (
      !redeemable ||
      (opts.seller_id && redeemable.seller_id !== opts.seller_id)
    ) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Code not found")
    }
    if (
      redeemable.status === "active" &&
      redeemable.expires_at &&
      new Date(redeemable.expires_at).getTime() < Date.now()
    ) {
      const [expired] = await this.updateRedeemables([
        { id: redeemable.id, status: "expired" },
      ])
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `This code expired on ${new Date(expired.expires_at!).toDateString()}`
      )
    }
    if (redeemable.status !== "active") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `This code is already ${redeemable.status}`
      )
    }
    return redeemable
  }

  /** ₦ a code is worth against an order/cart total. Tickets: venue only. */
  checkoutAmountFor(
    redeemable: { type: string; balance?: unknown; discount_type?: string | null; discount_value?: number | null },
    total: number
  ): number {
    if (redeemable.type === "ticket") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Tickets are redeemed at the venue — show the code or QR at the door"
      )
    }
    if (redeemable.type === "gift_card") {
      return Math.min(Number(redeemable.balance), total)
    }
    return redeemable.discount_type === "percent"
      ? Math.round((total * (redeemable.discount_value ?? 0)) / 100)
      : Math.min(redeemable.discount_value ?? 0, total)
  }

  // ── redemption doors ────────────────────────────────────────────────────

  /** Checkout door: draw down / consume + audit row. */
  async consumeAtCheckout(
    code: string,
    opts: { order_total: number; order_id?: string }
  ) {
    const redeemable = await this.getUsableByCode(code)
    const amount = this.checkoutAmountFor(redeemable, opts.order_total)
    if (amount <= 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This code has no value against this order"
      )
    }
    const updated = await this.applyDrawdown(redeemable, amount)
    const [redemption] = await this.createRedemptions([
      {
        redeemable_id: redeemable.id,
        amount_applied: amount,
        order_id: opts.order_id ?? null,
        channel: "checkout",
      },
    ])
    return { redeemable: updated, redemption, amount_applied: amount }
  }

  /** Compensation: checkout failed after consumption — put the value back. */
  async undoCheckoutConsumption(redemptionId: string) {
    const redemption = await this.retrieveRedemption(redemptionId)
    const redeemable = await this.retrieveRedeemable(redemption.redeemable_id)
    const restore =
      redeemable.type === "gift_card"
        ? {
            balance:
              Number(redeemable.balance ?? 0) +
              Number(redemption.amount_applied),
            status: "active" as const,
          }
        : { status: "active" as const }
    await this.updateRedeemables([{ id: redeemable.id, ...restore }])
    await this.deleteRedemptions([redemptionId])
  }

  /** In-store door: the owning seller redeems what the buyer shows. */
  async redeemInStore(
    code: string,
    sellerId: string,
    opts: { amount?: number } = {}
  ) {
    const redeemable = await this.getUsableByCode(code, {
      seller_id: sellerId,
    })

    let amount: number
    if (redeemable.type === "gift_card") {
      if (!opts.amount || opts.amount <= 0) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Gift card redemption needs the amount to draw down"
        )
      }
      if (opts.amount > Number(redeemable.balance)) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Only ${Number(redeemable.balance)} left on this card`
        )
      }
      amount = opts.amount
    } else if (redeemable.type === "ticket") {
      amount = Number(redeemable.face_value)
    } else {
      amount =
        redeemable.discount_type === "fixed"
          ? (redeemable.discount_value ?? 0)
          : 0 // percent voucher in-store: seller applies it on their own till
    }

    const updated = await this.applyDrawdown(redeemable, amount)
    const [redemption] = await this.createRedemptions([
      {
        redeemable_id: redeemable.id,
        amount_applied: amount,
        order_id: null,
        channel: "in_store",
      },
    ])
    return { redeemable: updated, redemption }
  }

  /** Seller cancels an own, still-active code. */
  async cancelRedeemable(id: string, sellerId: string) {
    const [redeemable] = await this.listRedeemables({ id })
    if (!redeemable || redeemable.seller_id !== sellerId) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Code not found")
    }
    if (redeemable.status !== "active") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot cancel a ${redeemable.status} code`
      )
    }
    const [updated] = await this.updateRedeemables([
      { id, status: "cancelled" },
    ])
    return updated
  }

  // gift cards deplete; vouchers/tickets die on first use
  private async applyDrawdown(
    redeemable: { id: string; type: string; balance?: unknown },
    amount: number
  ) {
    const patch =
      redeemable.type === "gift_card"
        ? (() => {
            const newBalance = Number(redeemable.balance) - amount
            return {
              balance: newBalance,
              status: newBalance <= 0 ? ("redeemed" as const) : ("active" as const),
            }
          })()
        : { status: "redeemed" as const }
    const [updated] = await this.updateRedeemables([
      { id: redeemable.id, ...patch },
    ])
    return updated
  }
}

export default RedeemablesModuleService
