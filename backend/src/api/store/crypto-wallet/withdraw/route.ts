import { MedusaResponse } from "@medusajs/framework/http"
import { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import UserWalletModuleService from "../../../../modules/user-wallet/service"
import { USER_WALLET_MODULE } from "../../../../modules/user-wallet"
import { PostCryptoWalletWithdrawSchema } from "../../../middlewares"
import { verifyCustomerPassword } from "../../../../lib/auth/verify-customer-password"
import { z } from "@medusajs/framework/zod"

type PostCryptoWalletWithdrawBody = z.infer<
  typeof PostCryptoWalletWithdrawSchema
>

// Send USDC out of the authenticated customer's managed wallet to an external
// USDC address of the customer's choice. There is no destination allowlist:
// the ONE gate is password re-entry — the caller must prove they know their
// account password again, which the login provider would only accept for the
// real owner. Replays of the same idempotency key return the same spend.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostCryptoWalletWithdrawBody>,
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

  // Password re-entry BEFORE any intent is recorded: a wrong password must not
  // even create a wallet_spend row.
  const confirmed = await verifyCustomerPassword(
    req.scope as never,
    actorId,
    body.password
  )
  if (!confirmed) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Password confirmation failed"
    )
  }

  const walletModule =
    req.scope.resolve<UserWalletModuleService>(USER_WALLET_MODULE)

  // Reference namespaced server-side so a withdraw reference can never collide
  // with a payment-session reference (the mock signer keys spends by reference).
  const reference = `withdraw:${body.idempotency_key}`

  const { spend } = await walletModule.createSpendIntent({
    actor_type: "customer",
    actor_id: actorId,
    idempotency_key: body.idempotency_key,
    to_address: body.to_address,
    usdc_amount: body.usdc_amount,
    reference,
  })

  const signed = await walletModule.signSpend({
    actor_type: "customer",
    actor_id: actorId,
    idempotency_key: body.idempotency_key,
  })

  res.json({ spend: signed })
}
