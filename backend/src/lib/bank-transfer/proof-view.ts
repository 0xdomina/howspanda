import type { InferTypeOf } from "@medusajs/framework/types"
import PaymentProof from "../../modules/marketplace/models/payment-proof"
import { resolvePaymentProofUrl } from "./private-proof"

type PaymentProofRow = InferTypeOf<typeof PaymentProof>

/** Sanitized, serializable view of a bank-transfer proof row. Never leaks the
 *  bank account on seller-only calls (the caller decides what to include). */
export async function toBankTransferView(proof: PaymentProofRow) {
  return {
    id: proof.id,
    order_id: proof.order_id,
    seller_id: proof.seller_id,
    reference: proof.reference,
    status: proof.status,
    currency_code: proof.currency_code,
    amount: proof.amount != null ? Number(proof.amount) : null,
    bank: proof.bank ?? null,
    proof_url: await resolvePaymentProofUrl(proof.proof_url),
    buyer_note: proof.buyer_note ?? null,
    rejection_note: proof.rejection_note ?? null,
    recheck_until: proof.recheck_until ?? null,
    submitted_at: proof.submitted_at ?? null,
    confirmed_at: proof.confirmed_at ?? null,
    rejected_at: proof.rejected_at ?? null,
    expired_at: proof.expired_at ?? null,
  }
}
