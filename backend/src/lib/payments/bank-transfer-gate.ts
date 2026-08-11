import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import type { MedusaRequest } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import MarketplaceModuleService from "../../modules/marketplace/service"
import { bankNameByCode } from "./banks"

type Scope = MedusaRequest["scope"]

// The manual payment provider id, surfaced as the bank-transfer rail.
export const BANK_TRANSFER_PROVIDER_ID = "pp_system_default"

export type BankTransferSeller = {
  sellerId: string
  sellerName?: string | null
  sellerHandle?: string | null
  account: {
    bank_code: string
    bank_name?: string
    account_number: string
    account_name: string
  }
}

/**
 * Direct-to-seller bank transfer gate.
 *
 * The rail is only offered when the cart has EXACTLY ONE seller and that
 * seller has a verified default bank payout account to receive the transfer.
 * Multi-seller carts are excluded on purpose — a buyer would otherwise have to
 * transfer to several accounts and the rail stops being "simple". Trusted
 * sellers gate store creation elsewhere; this only checks the money rail is
 * actually receivable.
 */
export async function getBankTransferSellerForCart(
  scope: Scope,
  cartId: string
): Promise<BankTransferSeller | null> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [cart] } = await query.graph({
    entity: "cart",
    fields: [
      "items.product.seller.id",
      "items.product.seller.name",
      "items.product.seller.handle",
    ],
    filters: { id: cartId },
  })

  if (!cart) {
    return null
  }

  const sellerIds = [
    ...new Set(
      (cart.items ?? [])
        .map((item: any) => item.product?.seller?.id)
        .filter(Boolean) as string[]
    ),
  ]
  if (sellerIds.length !== 1) {
    return null
  }

  const sellerId = sellerIds[0]
  const marketplace: MarketplaceModuleService =
    scope.resolve(MARKETPLACE_MODULE)
  const [account] = await marketplace.listPayoutAccounts({
    seller_id: sellerId,
    type: "bank_account",
    status: "verified",
    is_default: true,
  })
  if (!account) {
    return null
  }

  const seller = (cart.items ?? []).find(
    (item: any) => item.product?.seller?.id === sellerId
  )?.product?.seller

  return {
    sellerId,
    sellerName: seller?.name ?? null,
    sellerHandle: seller?.handle ?? null,
    account: {
      bank_code: account.bank_code ?? "",
      bank_name: account.bank_code
        ? bankNameByCode(account.bank_code)
        : undefined,
      account_number: account.account_number ?? "",
      account_name: account.account_name ?? "",
    },
  }
}

/** Throws when a cart may not use the direct-to-seller bank transfer rail. */
export async function assertBankTransferAllowedForCart(
  scope: Scope,
  cartId: string
): Promise<void> {
  const seller = await getBankTransferSellerForCart(scope, cartId)
  if (!seller) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Bank transfer is unavailable for this cart — it must contain a single store with a verified payout account."
    )
  }
}
