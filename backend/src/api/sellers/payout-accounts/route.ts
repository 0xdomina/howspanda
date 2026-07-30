import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import {
  PaystackTransferError,
  createRecipient,
  resolveAccount,
} from "../../../lib/payments/payouts/paystack-transfers"
import { PostPayoutAccountSchema } from "../../middlewares"
import { z } from "@medusajs/framework/zod"

type PostPayoutAccountBody = z.infer<typeof PostPayoutAccountSchema>

// Minimal shape validation only — a bank account is verified by Paystack's
// name resolve; a crypto address is ultimately verified by the transfer itself.
const BASE_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

async function resolveSellerId(
  req: AuthenticatedMedusaRequest
): Promise<string> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  return sellerAdmin.seller.id
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const payoutAccounts = await marketplace.listPayoutAccounts(
    { seller_id: sellerId },
    { order: { created_at: "ASC" } }
  )

  res.json({ payout_accounts: payoutAccounts })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostPayoutAccountBody>,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const body = req.validatedBody

  // First account of its type becomes the default destination for that rail.
  const existingOfType = await marketplace.listPayoutAccounts({
    seller_id: sellerId,
    type: body.type,
  })
  const isDefault = existingOfType.length === 0

  if (body.type === "bank_account") {
    // Resolve the account name first — a failed resolve stores NOTHING.
    let accountName: string
    try {
      const resolved = await resolveAccount(body.account_number, body.bank_code)
      accountName = resolved.account_name
    } catch (e) {
      if (e instanceof PaystackTransferError) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, e.message)
      }
      throw e
    }

    const { recipient_code } = await createRecipient({
      name: accountName,
      account_number: body.account_number,
      bank_code: body.bank_code,
    })

    const payoutAccount = await marketplace.createPayoutAccounts({
      seller_id: sellerId,
      type: "bank_account",
      currency_code: "ngn",
      bank_code: body.bank_code,
      account_number: body.account_number,
      account_name: accountName,
      recipient_code,
      is_default: isDefault,
      status: "verified",
    })

    return res.status(201).json({ payout_account: payoutAccount })
  }

  // crypto_address
  const addressOk =
    body.network === "base"
      ? BASE_ADDRESS_RE.test(body.address)
      : SOLANA_ADDRESS_RE.test(body.address)

  if (!addressOk) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid ${body.network} address format`
    )
  }

  const payoutAccount = await marketplace.createPayoutAccounts({
    seller_id: sellerId,
    type: "crypto_address",
    currency_code: "usdc",
    network: body.network,
    address: body.address,
    is_default: isDefault,
    status: "verified",
  })

  res.status(201).json({ payout_account: payoutAccount })
}
