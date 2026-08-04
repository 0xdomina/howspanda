import { MedusaResponse } from "@medusajs/framework/http"
import { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import UserWalletModuleService from "../../../../modules/user-wallet/service"
import { USER_WALLET_MODULE } from "../../../../modules/user-wallet"
import { getCryptoSettlement } from "../../../../lib/payments/crypto"
import { CRYPTO_USDC_ID } from "../../../../lib/payments/fees"
import { PostCryptoWalletPaySchema } from "../../../middlewares"
import { z } from "@medusajs/framework/zod"

type PostCryptoWalletPayBody = z.infer<typeof PostCryptoWalletPaySchema>

// Pay for a crypto-usdc payment session from the customer's managed wallet.
//
// SECURITY: the destination address is NEVER client-supplied. It is
// re-derived server-side from the session's deposit reference and compared
// against the session's stored address — so a forged session_id or tampered
// session data can only ever point the transfer at the platform's own
// per-session deposit address, never an arbitrary recipient. The wallet being
// debited is always the authenticated actor's own.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostCryptoWalletPayBody>,
  res: MedusaResponse
) => {
  const actorId = req.auth_context.actor_id
  if (!actorId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Authentication required"
    )
  }
  const body = req.validatedBody

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const payment = req.scope.resolve(Modules.PAYMENT)

  // 1. The session must be one the authenticated customer created from their
  //    own cart (ownership check before any money moves).
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "payment_collection.payment_sessions.id"],
    filters: { customer_id: [actorId] },
  })
  const ownedSessionIds = new Set(
    (carts ?? []).flatMap(
      (c) =>
        (c.payment_collection?.payment_sessions ?? []).map(
          (s: any) => s.id
        )
    )
  )
  if (!ownedSessionIds.has(body.session_id)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Payment session not found for this customer"
    )
  }

  // 2. Load the session — provider + deposit data live server-side.
  const session = await payment.retrievePaymentSession(body.session_id)
  if (session.provider_id !== CRYPTO_USDC_ID) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Session is not a crypto-usdc payment session"
    )
  }
  const data = (session.data ?? {}) as {
    reference?: string
    address?: string
    usdc_amount?: string
    network?: string
  }
  if (!data.reference || !data.address || !data.usdc_amount) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Session is missing deposit data"
    )
  }

  // 3. Re-derive the destination from the session reference server-side and
  //    require an exact match with the stored address. Any mismatch means the
  //    session data was tampered with → refuse.
  const settlement = getCryptoSettlement(data.network)
  const expected = await settlement.createDepositIntent({
    reference: data.reference,
    usdc_amount: data.usdc_amount,
  })
  if (expected.address !== data.address) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Session deposit address mismatch"
    )
  }

  // 4. Idempotent spend: replaying the same idempotency key returns the same
  //    intent (default key = the session id — one pay per session).
  const walletModule =
    req.scope.resolve<UserWalletModuleService>(USER_WALLET_MODULE)
  const idempotencyKey = body.idempotency_key ?? body.session_id

  const { spend } = await walletModule.createSpendIntent({
    actor_type: "customer",
    actor_id: actorId,
    idempotency_key: idempotencyKey,
    to_address: data.address,
    usdc_amount: data.usdc_amount,
    reference: data.reference,
    network: data.network,
  })

  const signed = await walletModule.signSpend({
    actor_type: "customer",
    actor_id: actorId,
    idempotency_key: idempotencyKey,
    network: data.network,
  })

  res.json({ spend: signed })
}
