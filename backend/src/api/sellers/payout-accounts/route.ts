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
  createRecipient,
  isMockMode,
  resolveAccount,
} from "../../../lib/payments/payouts/paystack-transfers"
import { PostPayoutAccountSchema } from "../../middlewares"
import { z } from "@medusajs/framework/zod"
import { requireSellerOwner } from "../../../lib/sellers/resolve-seller"

type PostPayoutAccountBody = z.infer<typeof PostPayoutAccountSchema>

// Manual configuration first: the seller types their account details, buyers
// pay directly into them. Paystack verification (name resolve + transfer
// recipient) upgrades the account when live keys are configured; any
// Paystack failure degrades gracefully instead of blocking the seller.
const BASE_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

async function resolveSellerId(
  req: AuthenticatedMedusaRequest
): Promise<string> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const context = await requireSellerOwner(req)
  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id"],
    filters: {
      id: [context.sellerAdminId],
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
  await requireSellerOwner(req)
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
  await requireSellerOwner(req)
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
    // Manual configuration is authoritative: the seller types their account
    // details and buyers pay directly into them. When live Paystack keys are
    // configured, we additionally verify the name resolve and create a real
    // transfer recipient (needed for Paystack payouts later). Any Paystack
    // failure — bad key, network, provider outage — degrades gracefully to
    // the manual entry instead of blocking the seller.
    let accountName = body.account_name
    let recipientCode = `RCP_manual_${body.account_number}`
    if (!isMockMode()) {
      try {
        const resolved = await resolveAccount(
          body.account_number,
          body.bank_code
        )
        accountName = resolved.account_name
      } catch {
        // Keep the seller-typed name; verification simply didn't happen.
      }
      try {
        const recipient = await createRecipient({
          name: accountName,
          account_number: body.account_number,
          bank_code: body.bank_code,
        })
        recipientCode = recipient.recipient_code
      } catch {
        // Manual account stays payout-capable via manual transfer until a
        // real recipient is created (re-saving with live keys upgrades it).
      }
    }

    const payoutAccount = await marketplace.createPayoutAccounts({
      seller_id: sellerId,
      type: "bank_account",
      currency_code: "ngn",
      bank_code: body.bank_code,
      account_number: body.account_number,
      account_name: accountName,
      recipient_code: recipientCode,
      is_default: isDefault,
      status: "verified",
    })

    return res.status(201).json({ payout_account: payoutAccount })
  }

  // crypto_address
  const addressOk =
    body.network === "base" || body.network === "arc"
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
