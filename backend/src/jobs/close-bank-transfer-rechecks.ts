import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"
import { sendBankTransferNotice } from "../lib/bank-transfer/notify"

// Recheck sweep for direct-to-seller bank transfers. A rejected proof is NOT
// final — it opens a recheck window (the transfer may still be landing after
// a network delay). If neither side resolves it before the deadline, the
// order is cancelled and both the buyer and the store are notified. The
// rejection already told the buyer the store couldn't find the money; this
// just closes the loop automatically with no back-and-forth.
export default async function closeBankTransferRechecksJob(
  container: MedusaContainer
) {
  const marketplace =
    container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const expired = await marketplace.expireRejectedProofs()
  if (!expired.length) {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const sellerIds = new Set(expired.map((proof) => proof.seller_id))
  const admins = await marketplace.listSellerAdmins({}, { take: null })
  const emailsBySeller = new Map<string, string[]>()
  for (const admin of admins) {
    if (!admin.seller_id || !admin.email) continue
    if (!sellerIds.has(admin.seller_id)) continue
    const list = emailsBySeller.get(admin.seller_id) ?? []
    list.push(admin.email)
    emailsBySeller.set(admin.seller_id, list)
  }

  for (const proof of expired) {
    try {
      await cancelOrderWorkflow(container).run({
        input: { order_id: proof.order_id },
        container,
      })
    } catch (error: any) {
      logger.warn(
        `close-bank-transfer-rechecks: could not cancel order ${proof.order_id}: ${error?.message}`
      )
    }

    await sendBankTransferNotice(container, {
      to: proof.buyer_email,
      recipient: "buyer",
      kind: "bank_transfer_expired",
      subject: "Your bank transfer order was closed",
      bodyHtml: `The store could not confirm your bank transfer for order ${proof.order_id}, so the order has been closed. If you did transfer, contact the store directly — they can still refund you — or reach support. Reference: ${proof.reference}.`,
      payload: { order_id: proof.order_id, reference: proof.reference },
    })

    const sellerEmails = emailsBySeller.get(proof.seller_id) ?? []
    for (const email of sellerEmails) {
      await sendBankTransferNotice(container, {
        to: email,
        recipient: "seller",
        kind: "bank_transfer_expired",
        subject: "A bank transfer order was closed — payment not confirmed",
        bodyHtml: `The buyer's bank transfer for order ${proof.order_id} was never confirmed within the recheck window, so the order was closed. If the money actually arrived, contact the buyer or support to sort out the refund. Reference: ${proof.reference}.`,
        payload: { order_id: proof.order_id, reference: proof.reference },
      })
    }
  }

  logger.info(
    `close-bank-transfer-rechecks: ${expired.length} bank-transfer order(s) closed`
  )
}

export const config = {
  name: "close-bank-transfer-rechecks",
  schedule: "0 * * * *",
}
