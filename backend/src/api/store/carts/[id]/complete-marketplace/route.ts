import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import createSellerOrdersWorkflow from "../../../../../workflows/marketplace/create-seller-orders"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { BANK_TRANSFER_PROVIDER_ID } from "../../../../../lib/payments/bank-transfer-gate"
import { bankNameByCode } from "../../../../../lib/payments/banks"
import { REDEEMABLES_MODULE } from "../../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../../modules/redeemables/service"
import { GROWTH_MODULE } from "../../../../../modules/growth"
import GrowthModuleService from "../../../../../modules/growth/service"
import MallModuleService from "../../../../../modules/mall/service"
import { MALL_MODULE } from "../../../../../modules/mall"
import BuyerWalletModuleService from "../../../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../../../modules/buyer-wallet"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const cartId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)

  const { data: [cart] } = await query.graph({
    entity: "cart",
    fields: ["id", "total", "metadata"],
    filters: { id: cartId },
  })
  const code = cart?.metadata?.redeemable_code as string | undefined

  // consume first — the buyer must never be charged against a dead code;
  // the value comes back (compensation below) if anything downstream fails
  let consumption:
    | Awaited<ReturnType<RedeemablesModuleService["consumeAtCheckout"]>>
    | undefined
  if (code) {
    consumption = await redeemables.consumeAtCheckout(code, {
      order_total: Number(
        cart?.metadata?.redeemable_base_total ?? cart?.total ?? 0
      ),
    })
  }

  try {
    const { result } = await createSellerOrdersWorkflow(req.scope).run({
      input: {
        cart_id: cartId,
      },
    })

    const mallId = cart?.metadata?.mall_id as string | undefined
    if (mallId && result.order.email) {
      const malls = req.scope.resolve<MallModuleService>(MALL_MODULE)
      const mallResult = await malls.recordPurchase({
        mallId,
        buyerEmail: result.order.email,
        orderId: result.order.id,
      })
      if (mallResult?.won) {
        const wallet = req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)
        const { ledger } = await wallet.credit({
          buyerEmail: result.order.email,
          amount: mallResult.prizeAmount,
          source: "mall_prize",
          reference: result.order.id,
        })
        const prizes = await malls.listMallPrizes({
          mall_id: mallId,
          winner_buyer_email: result.order.email,
        })
        if (prizes.length) {
          await malls.updateMallPrizes({
            id: prizes[prizes.length - 1].id,
            wallet_ledger_id: ledger.id,
            claimed: true,
          })
        }
      }
    }

    if (consumption) {
      await redeemables.updateRedemptions([
        { id: consumption.redemption.id, order_id: result.order.id },
      ])
    }

    // Campaign #2 hook: qualifying spend accrues arc_pool revenue-share + raffle
    // tickets (idempotent per order) for any live arc_pool challenge.
    if (result.order.email) {
      await growth.recordBuyerSpend({
        buyerEmail: result.order.email,
        // order.total is kobo (minor unit); the challenge ledger is in naira.
        amountNgn: Number(result.order.total ?? 0) / 100,
        orderId: result.order.id,
      })
    }

    // Direct-to-seller bank transfer rail: when the order was paid with the
    // manual provider (surfaced as "Pay by Bank Transfer"), snapshot the
    // seller's verified account + generate the narration reference so the
    // buyer can transfer and upload proof. Single-seller carts only (the
    // checkout gate guarantees this); skip silently otherwise.
    const marketplace: MarketplaceModuleService =
      req.scope.resolve(MARKETPLACE_MODULE)
    const { data: [placedOrder] } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "payment_collections.payment_sessions.provider_id",
        "items.product.seller.id",
      ],
      filters: { id: result.order.id },
    })
    const providers = (placedOrder?.payment_collections ?? []).flatMap(
      (collection: any) =>
        (collection.payment_sessions ?? []).map(
          (session: any) => session.provider_id
        )
    )
    if (providers.includes(BANK_TRANSFER_PROVIDER_ID)) {
      const sellerIds = [
        ...new Set(
          (placedOrder?.items ?? [])
            .map((item: any) => item.product?.seller?.id)
            .filter(Boolean) as string[]
        ),
      ]
      if (sellerIds.length === 1) {
        const [account] = await marketplace.listPayoutAccounts({
          seller_id: sellerIds[0],
          type: "bank_account",
          status: "verified",
          is_default: true,
        })
        if (account && placedOrder?.email && placedOrder.display_id != null) {
          await marketplace.createBankTransferProof({
            orderId: placedOrder.id,
            sellerId: sellerIds[0],
            buyerEmail: placedOrder.email,
            reference: marketplace.bankTransferReference(placedOrder.display_id),
            currencyCode: placedOrder.currency_code,
            bank: {
              bank_code: account.bank_code ?? "",
              bank_name: account.bank_code
                ? bankNameByCode(account.bank_code)
                : undefined,
              account_number: account.account_number ?? "",
              account_name: account.account_name ?? "",
            },
          })
        }
      }
    }

    res.json({
      type: "order",
      order: result.order,
      ...(consumption
        ? { redeemable_applied: consumption.amount_applied }
        : {}),
    })
  } catch (e) {
    if (consumption) {
      await redeemables.undoCheckoutConsumption(consumption.redemption.id)
    }
    throw e
  }
}
