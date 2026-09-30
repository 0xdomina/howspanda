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
import { requirePlatformFeature } from "../../../../../lib/features/access"
import {
  notifySellerNewOrder,
  telegramConfigured,
} from "../../../../../lib/telegram/notify"
import { resolveDelivery } from "../../../../../lib/delivery/resolve"

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
  const mallId = cart?.metadata?.mall_id as string | undefined
  if (mallId) {
    await requirePlatformFeature(req.scope, "malls")
  }

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
        "items.product.metadata",
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
        // Delivery snapshot at checkout: per-product override wins, else the
        // store default (fixed fee / free / courier-request). Recorded on the
        // proof so the seller verifies goods + fee against one transfer.
        const { data: [sellerRow] } = (await query.graph({
          entity: "seller",
          fields: ["id", "delivery_fee", "free_delivery"],
          filters: { id: sellerIds },
        })) as { data: any[] }
        let deliveryMode: string | undefined
        let deliveryFee: number | undefined
        try {
          // Single selling mode per order today: first item's resolution wins
          // (mixed carts resolve per item at display time; the proof carries
          // the order-level snapshot the buyer actually paid).
          const firstMeta = (placedOrder?.items ?? []).map(
            (i: any) => i?.product?.metadata
          )
          const resolved = firstMeta.map((m: any) =>
            resolveDelivery(m, sellerRow)
          )
          const fixed = resolved.find((r) => r.mode === "fixed")
          const picked =
            fixed ?? resolved.find((r) => r.mode === "free") ?? resolved[0]
          if (picked) {
            deliveryMode = picked.mode
            deliveryFee = picked.fee || undefined
          }
        } catch {
          // Delivery snapshot is advisory — never fail order completion.
        }
        if (account && placedOrder?.email && placedOrder.display_id != null) {
          await marketplace.createBankTransferProof({
            orderId: placedOrder.id,
            sellerId: sellerIds[0],
            buyerEmail: placedOrder.email,
            reference: marketplace.bankTransferReference(placedOrder.display_id),
            currencyCode: placedOrder.currency_code,
            deliveryMode,
            deliveryFee,
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

    // Telegram order alerts: ping each linked store — but ONLY when payment
    // is already confirmed. Bank-transfer orders carry no money at creation
    // (proof comes later via "I've made this transfer"), so the seller hears
    // about those on proof submit, with the receipt attached — never here.
    // Instant rails (card/crypto authorizations) notify at creation.
    const isBankTransfer = providers.includes(BANK_TRANSFER_PROVIDER_ID)
    try {
      if (telegramConfigured() && placedOrder && !isBankTransfer) {
        const counts = new Map<string, number>()
        for (const item of (placedOrder.items ?? []) as any[]) {
          const sid = item?.product?.seller?.id as string | undefined
          if (sid) counts.set(sid, (counts.get(sid) ?? 0) + (Number(item.quantity) || 1))
        }
        if (counts.size > 0) {
          const { data: sellers } = await query.graph({
            entity: "seller",
            fields: ["id", "name", "telegram_chat_id"],
            filters: { id: [...counts.keys()] },
          })
          const major = Number(placedOrder.total ?? 0) / 100
          const totalFormatted = `${placedOrder.currency_code?.toUpperCase() ?? "NGN"} ${major.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
          const storefront = (process.env.STOREFRONT_URL || "https://hows-u.vercel.app").replace(/\/$/, "")
          await Promise.all(
            (sellers ?? [])
              .filter((s: any) => s?.telegram_chat_id)
              .map((s: any) =>
                notifySellerNewOrder({
                  chatId: s.telegram_chat_id as string,
                  storeName: s.name ?? "Your store",
                  orderDisplayId: placedOrder.display_id ?? placedOrder.id,
                  itemCount: counts.get(s.id) ?? 0,
                  totalFormatted,
                  buyerEmail: placedOrder.email,
                  manageUrl: `${storefront}/ng/seller/orders`,
                }).catch(() => false)
              )
          )
        }
      }
    } catch {
      // Alerts never fail orders.
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
