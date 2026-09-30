import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { assertOrderEmail } from "../../../../../lib/escrow/order-access"
import { toBankTransferView } from "../../../../../lib/bank-transfer/proof-view"
import { sendBankTransferNotice } from "../../../../../lib/bank-transfer/notify"
import { resolvePaymentProofUrl } from "../../../../../lib/bank-transfer/private-proof"
import {
  notifySellerProofSubmitted,
  telegramConfigured,
} from "../../../../../lib/telegram/notify"

type PostBankProofBody = {
  email: string
  reference: string
  proof_url?: string
  amount?: number
  note?: string
}

// Buyer submits proof of their direct bank transfer. The reference must match
// the one issued at checkout; a rejection (recheck window) can be re-submitted.
export const POST = async (
  req: MedusaRequest<PostBankProofBody>,
  res: MedusaResponse
) => {
  const { email } = req.validatedBody
  await assertOrderEmail(req.scope, req.params.id, email, req)

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const proofs = await marketplace.listPaymentProofs(
    { order_id: req.params.id },
    { order: { created_at: "ASC" } }
  )
  if (!proofs.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "This order was not paid by bank transfer"
    )
  }
  if (proofs.length > 1) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "This order has more than one bank transfer — contact support"
    )
  }

  const proof = await marketplace.submitBankTransferProof(
    req.params.id,
    proofs[0].seller_id,
    {
      reference: req.validatedBody.reference,
      proofUrl: req.validatedBody.proof_url,
      amount: req.validatedBody.amount,
      note: req.validatedBody.note,
    }
  )

  await sendBankTransferNotice(req.scope, {
    to: proof.buyer_email,
    recipient: "buyer",
    kind: "bank_transfer_submitted",
    subject: "We got your transfer proof — pending the store's confirmation",
    bodyHtml: `Your bank transfer for order ${proof.order_id} is awaiting the store's confirmation. Reference: ${proof.reference}.`,
    payload: { order_id: proof.order_id, reference: proof.reference },
  })

  // Payment-gated seller alert: the store hears about this order NOW (proof
  // submitted with the buyer's "I've made this transfer"), not at creation
  // when no money had moved. Receipt rides along as a Telegram photo.
  // Best-effort — never fails the buyer's submit.
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: [seller] } = (await query.graph({
      entity: "seller",
      fields: ["id", "name", "telegram_chat_id"],
      filters: { id: [proof.seller_id] },
    })) as { data: any[] }
    const { data: [placedOrder] } = (await query.graph({
      entity: "order",
      fields: ["id", "display_id", "total", "currency_code", "items.quantity"],
      filters: { id: req.params.id },
    })) as { data: any[] }
    const receiptUrl = await resolvePaymentProofUrl(proof.proof_url).catch(() => null)
    const storefront = (process.env.STOREFRONT_URL || "https://hows-u.vercel.app").replace(/\/$/, "")
    const itemCount = ((placedOrder?.items ?? []) as any[]).reduce(
      (n: number, i: any) => n + (Number(i.quantity) || 1),
      0
    )
    const major = Number(placedOrder?.total ?? proof.amount ?? 0) / 100
    const totalFormatted = `${placedOrder?.currency_code?.toUpperCase() ?? "NGN"} ${major.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`

    if (telegramConfigured() && (seller as any)?.telegram_chat_id) {
      await notifySellerProofSubmitted({
        chatId: (seller as any).telegram_chat_id as string,
        storeName: (seller as any).name ?? "Your store",
        orderId: req.params.id,
        orderDisplayId: placedOrder?.display_id ?? req.params.id,
        itemCount,
        totalFormatted,
        buyerEmail: proof.buyer_email,
        reference: proof.reference,
        receiptUrl,
        manageUrl: `${storefront}/ng/seller/orders`,
      }).catch(() => false)
    }

    const admins = await marketplace.listSellerAdmins({ seller_id: proof.seller_id } as any)
    for (const admin of admins ?? []) {
      if (!(admin as any)?.email) continue
      await sendBankTransferNotice(req.scope, {
        to: (admin as any).email,
        recipient: "seller",
        kind: "bank_transfer_submitted",
        subject: `Transfer proof submitted — order ${placedOrder?.display_id ?? req.params.id} needs your confirmation`,
        bodyHtml: `The buyer submitted transfer proof for order ${placedOrder?.display_id ?? req.params.id} (${totalFormatted}). Reference: ${proof.reference}. Confirm or reject it in Manage Business → Orders.`,
        payload: { order_id: proof.order_id, reference: proof.reference },
      })
    }
  } catch {
    // Seller alerts never fail the buyer's submit.
  }

  res.json({ order_id: req.params.id, transfer: await toBankTransferView(proof) })
}
