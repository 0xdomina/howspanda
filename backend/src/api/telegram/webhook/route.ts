import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import {
  notifyTelegramLinked,
  sendTelegramText,
  editTelegramButtons,
  PROOF_REJECT_REASONS,
} from "../../../lib/telegram/notify"
import { sendBankTransferNotice } from "../../../lib/bank-transfer/notify"
import { maybeAutoPostCourierJob } from "../../../lib/delivery/auto-post"
import {
  SECRETARY_HELP,
  MAIN_MENU_KEYBOARD,
  PAYOUT_REDIRECT,
  EDIT_FIELD_PROMPT,
  isPayoutAsk,
  parsePriceMajor,
  parseStatusValue,
  formatNgnMajor,
  newProductSummary,
  normalizeEditField,
  getSecretarySession,
  startSecretarySession,
  touchSecretarySession,
  clearSecretarySession,
  largestPhotoFileId,
  downloadTelegramFile,
  storeTelegramPhoto,
  setProductList,
  getProductList,
  productCardText,
} from "../../../lib/telegram/secretary"
import createSellerProductWorkflow from "../../../workflows/marketplace/create-seller-product"
import updateSellerProductWorkflow from "../../../workflows/marketplace/update-seller-product"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

// Menu-first operation center: every entry point answers with the persistent
// button menu so nothing needs memorizing. Buttons send plain words; the
// router maps them to the same commands.
async function sendMenu(chatId: number | string, text: string): Promise<boolean> {
  return sendTelegramText(chatId, text, { reply_markup: MAIN_MENU_KEYBOARD })
}

// Public Telegram webhook (set via setWebhook with TELEGRAM_WEBHOOK_SECRET).
// Link handshake (/start <code>) + seller secretary commands. Payouts are
// never actionable here — any payout ask gets a redirect reply.
type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string }
    text?: string
    caption?: string
    photo?: { file_id?: string; file_size?: number }[]
    document?: { file_id?: string; mime_type?: string; file_size?: number }
  }
  callback_query?: {
    id?: string
    data?: string
    message?: { message_id?: number; chat?: { id?: number | string } }
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (configuredSecret) {
    const presented =
      (req.headers["x-telegram-bot-api-secret-token"] as string | undefined) ??
      ""
    if (presented !== configuredSecret) {
      res.status(401).json({ ok: false })
      return
    }
  }

  const update = (req.body ?? {}) as TelegramUpdate

  // Inline-button taps arrive as callback_query — answer fast, act below.
  const callback = update.callback_query
  if (callback?.id) {
    await answerCallback(callback.id)
    const chatId = callback.message?.chat?.id
    const data = (callback.data ?? "").trim()
    if (chatId && (data === "sec:cancel" || data === "new:cancel")) {
      clearSecretarySession(String(chatId))
      await sendTelegramText(chatId, "Cancelled. Send /help to see what I can do.")
    } else if (chatId && (data === "sec:confirm" || data === "new:confirm")) {
      await handleConfirmStep(req, String(chatId))
    } else if (chatId && data.startsWith("proof:")) {
      await handleProofCallback(
        req,
        String(chatId),
        callback.message?.message_id,
        data
      )
    } else if (chatId && data.startsWith("p:")) {
      await handleProductCallback(
        req,
        String(chatId),
        callback.message?.message_id,
        data
      )
    } else if (chatId && data.startsWith("ord:done:")) {
      const store = await findStoreByChat(req, String(chatId)).catch(() => null)
      if (!store) {
        await sendTelegramText(String(chatId), "Link this chat to a store first.")
      } else {
        await handleOrderDelivered(req, String(chatId), store, data.split(":")[2] ?? "")
      }
    } else if (chatId && data.startsWith("ord:ship:")) {
      const store = await findStoreByChat(req, String(chatId)).catch(() => null)
      if (!store) {
        await sendTelegramText(String(chatId), "Link this chat to a store first.")
      } else {
        await handleOrderShipped(req, String(chatId), store, data.split(":")[2] ?? "")
      }
    }
    res.json({ ok: true })
    return
  }

  const chatId = update.message?.chat?.id
  // Captions ride on photo/document messages (DONE/SKIP sent with the
  // picture counts as the word itself).
  const text = (update.message?.text ?? update.message?.caption ?? "").trim()
  const photoFileId = largestPhotoFileId(update.message ?? {})

  // Always 200 quickly — Telegram retries anything else, and retries of a
  // consumed link code must stay harmless.
  if (!chatId) {
    res.json({ ok: true })
    return
  }

  // Link handshake keeps its exact behavior.
  if (text.startsWith("/start")) {
    const code = text.replace(/^\/start\s*/, "").trim()
    if (!code) {
      const linked = await findStoreByChat(req, String(chatId))
      await sendTelegramText(
        chatId,
        linked
          ? `${linked.storeName} is already linked. ${SECRETARY_HELP}`
          : "Welcome! To link order alerts, generate a link code in your seller settings (Manage Business → Store settings → Order alerts) and tap its button."
      )
      res.json({ ok: true })
      return
    }
    await handleLinkCode(req, String(chatId), code)
    res.json({ ok: true })
    return
  }

  const store = await findStoreByChat(req, String(chatId)).catch(() => null)
  if (!store) {
    // Photos from unlinked chats cannot be acted on.
    await sendTelegramText(
      chatId,
      "This chat is not linked to a store yet. Generate a link code in seller settings (Manage Business → Store settings → Order alerts), then send /start <code> here."
    )
    res.json({ ok: true })
    return
  }

  if (text && isPayoutAsk(text)) {
    await sendTelegramText(chatId, PAYOUT_REDIRECT)
    res.json({ ok: true })
    return
  }

  // Photo outside a photo step: guide, unless we are collecting photos.
  const session = getSecretarySession(String(chatId))
  if (
    photoFileId &&
    (!session || (session.step !== "new_photos" && session.step !== "edit_photo"))
  ) {
    await sendTelegramText(
      chatId,
      "Got a photo. Send /new to start a product, /edit to change a photo, then send photos when I ask for them."
    )
    res.json({ ok: true })
    return
  }
  if (photoFileId && session && session.step === "new_photos") {
    await handlePhotoStep(req, String(chatId), photoFileId)
    res.json({ ok: true })
    return
  }
  if (photoFileId && session && session.step === "edit_photo") {
    await handleEditPhoto(req, String(chatId), photoFileId)
    res.json({ ok: true })
    return
  }

  const command = text.split(/\s+/)[0]?.toLowerCase() ?? ""
  const word = text.trim().toLowerCase()
  try {
    switch (command) {
    case "/help":
    case "help":
      clearIfIdle(String(chatId))
      await sendMenu(chatId, SECRETARY_HELP)
      break
    case "/cancel":
    case "cancel":
      clearSecretarySession(String(chatId))
      await sendMenu(chatId, "Cancelled. The menu below runs everything.")
      break
    case "/unlink":
    case "unlink":
      await handleUnlink(req, String(chatId), store.sellerId)
      break
    case "/products":
    case "products":
      clearSecretarySession(String(chatId))
      await handleProducts(req, String(chatId), store)
      break
    case "/new":
    case "new":
    case "add":
      clearSecretarySession(String(chatId))
      startSecretarySession({
        chatId: String(chatId),
        sellerId: store.sellerId,
        sellerAdminId: store.sellerAdminId,
        storeName: store.storeName,
        step: "new_title",
      })
      await sendTelegramText(chatId, "What is the product title?")
      break
    case "/orders":
    case "orders":
      clearSecretarySession(String(chatId))
      await handleOrders(req, String(chatId), store)
      break
    case "/store":
    case "store":
      clearSecretarySession(String(chatId))
      await handleStore(req, String(chatId), store)
      break
    case "/edit":
    case "edit":
      await handleEditStart(req, String(chatId), store)
      break
      default:
        if (/^\d+$/.test(word) && (!session || session.step === "idle")) {
          // Number tap from a product list (no memorization needed).
          await handleProductNumber(req, String(chatId), Number(word))
        } else if (word === "add product") {
          clearSecretarySession(String(chatId))
          startSecretarySession({
            chatId: String(chatId),
            sellerId: store.sellerId,
            sellerAdminId: store.sellerAdminId,
            storeName: store.storeName,
            step: "new_title",
          })
          await sendTelegramText(chatId, "What is the product title?")
        } else if (session && session.step !== "idle") {
          await handleFlowText(req, String(chatId), text)
        } else if (text) {
          await sendMenu(chatId, SECRETARY_HELP)
        }
        break
    }
  } catch {
    await sendTelegramText(
      chatId,
      "Something hiccuped on my side. Try again, or open Manage Business."
    ).catch(() => false)
  }

  res.json({ ok: true })
}

function clearIfIdle(chatId: string) {
  const s = getSecretarySession(chatId)
  if (s && s.step === "idle") clearSecretarySession(chatId)
}

async function handleLinkCode(req: MedusaRequest, chatId: string, code: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = (await query.graph({
    entity: "seller",
    fields: ["id", "name", "telegram_link_code", "telegram_link_expires_at"],
    filters: { telegram_link_code: [code] } as any,
  })) as { data: any[] }

  const fresh =
    seller &&
    (seller as any).telegram_link_expires_at &&
    new Date((seller as any).telegram_link_expires_at).getTime() > Date.now()

  if (!fresh) {
    await sendTelegramText(
      chatId,
      "That link code expired or was already used. Generate a fresh one in seller settings → Order alerts and try again."
    )
    return
  }

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  await marketplace.updateSellers({
    id: seller.id,
    telegram_chat_id: chatId,
    telegram_link_code: null,
    telegram_link_expires_at: null,
  })

  await notifyTelegramLinked({
    chatId,
    storeName: (seller as any).name ?? "Your store",
  })
  await sendMenu(chatId, "Use the buttons below to run your store.")
}

async function findStoreByChat(
  req: MedusaRequest,
  chatId: string
): Promise<{ sellerId: string; sellerAdminId: string; storeName: string } | null> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = (await query.graph({
    entity: "seller",
    fields: ["id", "name"],
    filters: { telegram_chat_id: [chatId] } as any,
  })) as { data: any[] }
  const seller = data?.[0]
  if (!seller) return null
  const { data: admins } = (await query.graph({
    entity: "seller_admin",
    fields: ["id", "role"],
    filters: { seller_id: [seller.id] } as any,
  })) as { data: any[] }
  const owner =
    (admins ?? []).find((a: any) => a?.role === "owner") ?? (admins ?? [])[0]
  if (!owner) return null
  return {
    sellerId: seller.id,
    sellerAdminId: owner.id,
    storeName: seller.name ?? "Your store",
  }
}

async function handleUnlink(req: MedusaRequest, chatId: string, sellerId: string) {
  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  await marketplace.updateSellers({
    id: sellerId,
    telegram_chat_id: null,
    telegram_link_code: null,
    telegram_link_expires_at: null,
  })
  clearSecretarySession(chatId)
  await sendTelegramText(
    chatId,
    "Unlinked. Order alerts and the secretary are off for this chat until you link again.",
    { reply_markup: { remove_keyboard: true } }
  )
}

async function handleProducts(
  req: MedusaRequest,
  chatId: string,
  store: { sellerAdminId: string; storeName: string }
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = (await query.graph({
    entity: "seller_admin",
    fields: [
      "seller.products.id",
      "seller.products.title",
      "seller.products.status",
      "seller.products.variants.prices.amount",
      "seller.products.variants.prices.currency_code",
    ],
    filters: { id: [store.sellerAdminId] },
  })) as { data: any[] }
  const products = data?.[0]?.seller?.products ?? []
  if (!products.length) {
    await sendTelegramText(
      chatId,
      `${store.storeName} has no products yet. Send /new to create one.`
    )
    return
  }
  const lines = products.slice(0, 10).map((p: any, i: number) => {
    const amounts: number[] = (p.variants ?? []).flatMap((v: any) =>
      (v.prices ?? []).map((pr: any) => Number(pr.amount ?? 0))
    )
    const min = amounts.length ? Math.min(...amounts) / 100 : null
    return `${i + 1}. ${p.title ?? "Untitled"} — ${min != null ? formatNgnMajor(min) : "no price"} · ${p.status ?? ""}`
  })
  // Tappable cards: numbers open a detail card with Edit/Delete buttons.
  setProductList(
    chatId,
    products.slice(0, 10).map((p: any, i: number) => ({
      id: String(p.id),
      title: String(p.title ?? "Untitled"),
      detail: String(lines[i]).replace(/^\d+\.\s*/, ""),
    }))
  )
  if (products.length > 10) lines.push(`…and ${products.length - 10} more in Manage Business.`)
  lines.push(``, `Reply with a number to manage it.`)
  await sendTelegramText(chatId, lines.join("\n"))
}

// Number tap from a cached product list → detail card with Edit/Delete.
// Zero memorization: the list shows the numbers.
async function handleProductNumber(
  req: MedusaRequest,
  chatId: string,
  n: number
): Promise<void> {
  const store = await findStoreByChat(req, chatId).catch(() => null)
  if (!store) {
    await sendTelegramText(chatId, "Link this chat to a store first.")
    return
  }
  const list = getProductList(chatId)
  if (!list || !Number.isInteger(n) || n < 1 || n > list.length) {
    await sendMenu(chatId, "That list expired. Tap Products for a fresh one.")
    return
  }
  const entry = list[n - 1]
  await sendTelegramText(chatId, productCardText(entry), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Edit", callback_data: `p:edit:${n}` },
          { text: "Delete", callback_data: `p:del:${n}` },
        ],
      ],
    },
  })
}

async function handleProductCallback(
  req: MedusaRequest,
  chatId: string,
  messageId: number | undefined,
  data: string
): Promise<void> {
  const store = await findStoreByChat(req, chatId).catch(() => null)
  if (!store) {
    await sendTelegramText(chatId, "Link this chat to a store first.")
    return
  }
  const [, action, nRaw] = data.split(":")
  const n = Number(nRaw)
  const list = getProductList(chatId) ?? []
  const entry = Number.isInteger(n) && n >= 1 && n <= list.length ? list[n - 1] : null
  if (!entry) {
    await sendTelegramText(chatId, "That list expired. Tap Products for a fresh one.")
    return
  }

  if (action === "edit") {
    // Jump straight into the edit flow with this product preselected.
    const s = startSecretarySession({
      chatId,
      sellerId: store.sellerId,
      sellerAdminId: store.sellerAdminId,
      storeName: store.storeName,
      step: "edit_field",
    })
    s.edit = { list, productId: entry.id, productTitle: entry.title }
    touchSecretarySession(s)
    await sendTelegramText(chatId, `Editing "${entry.title}". ${EDIT_FIELD_PROMPT}`)
    return
  }

  if (action === "del") {
    await sendTelegramText(chatId, `Remove "${entry.title}"? This cannot be undone.`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Yes, remove", callback_data: `p:delYes:${n}` },
            { text: "Keep", callback_data: `p:delNo:${n}` },
          ],
        ],
      },
    })
    return
  }

  if (action === "delNo") {
    await sendTelegramText(chatId, "Kept.")
    return
  }

  if (action === "delYes") {
    try {
      // Re-verify ownership at delete time: the product must still sit
      // under this seller's store.
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: admins } = (await query.graph({
        entity: "seller_admin",
        fields: ["seller.products.id"],
        filters: { id: [store.sellerAdminId] },
      })) as { data: any[] }
      const owned = ((admins[0]?.seller?.products ?? []) as { id: string }[]).some(
        (p) => p.id === entry.id
      )
      if (!owned) {
        await sendTelegramText(chatId, "That product is already gone.")
        return
      }
      await deleteProductsWorkflow(req.scope).run({ input: { ids: [entry.id] } })
      setProductList(
        chatId,
        list.filter((_, i) => i !== n - 1)
      )
      await sendMenu(chatId, `Removed "${entry.title}".`)
    } catch {
      await sendTelegramText(chatId, "Could not remove it. Try Manage Business.")
    }
    return
  }
}

async function handleOrders(
  req: MedusaRequest,
  chatId: string,
  store: { sellerId: string; storeName: string }
) {
  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  const lines = await marketplace.listCommissionLines(
    { seller_id: store.sellerId } as any,
    { take: 5, order: { created_at: "DESC" } } as any
  )
  if (!lines.length) {
    await sendTelegramText(chatId, `No orders yet for ${store.storeName}.`)
    return
  }
  const rows = lines.map((l: any) => {
    const major = Number(l.net_amount ?? 0)
    const cur = String(l.currency_code ?? "ngn").toUpperCase()
    return `Order ${String(l.order_id).slice(-6)} · ${l.status} · ${cur} ${major.toLocaleString("en-NG")}`
  })
  // Tappable actions per order: submitted proofs get Confirm/Reject (same
  // one-click verdicts as the alerts), pending fulfilment gets Mark
  // delivered. Fulfil the order without opening the website.
  const buttons: { text: string; callback_data: string }[][] = []
  for (const l of lines as any[]) {
    const proof = await marketplace.bankTransferForOrder(l.order_id, store.sellerId).catch(() => null)
    if (proof?.status === "submitted") {
      buttons.push([
        { text: `Confirm ${String(l.order_id).slice(-6)}`, callback_data: `proof:confirm:${l.order_id}` },
        { text: "Reject", callback_data: `proof:reject:${l.order_id}` },
      ])
    } else if (l.status === "pending" && !(l as any).delivered_at && !(l as any).held_at) {
      const short = String(l.order_id).slice(-6)
      if (!(l as any).shipped_at) {
        buttons.push([
          { text: `Ship ${short}`, callback_data: `ord:ship:${l.order_id}` },
        ])
      } else {
        buttons.push([
          { text: `Delivered ${short}`, callback_data: `ord:done:${l.order_id}` },
        ])
      }
    }
  }
  const storefront = (process.env.STOREFRONT_URL || "https://hows-u.vercel.app").replace(/\/$/, "")
  await sendTelegramText(
    chatId,
    [...rows, ``, `Full detail in Manage Business: ${storefront}/ng/seller/orders`].join("\n"),
    buttons.length ? { reply_markup: { inline_keyboard: buttons } } : undefined
  )
}

// Dispatch from chat: the parcel is en route (mirrors Manage Business).
// Ownership re-checked like delivery.
async function handleOrderShipped(
  req: MedusaRequest,
  chatId: string,
  store: { sellerId: string },
  orderId: string
): Promise<void> {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: [order] } = (await query.graph({
      entity: "order",
      fields: ["id", "items.product.seller.id"],
      filters: { id: [orderId] },
    }).catch(() => ({ data: [] }))) as { data: any[] }
    const mine = ((order as any)?.items ?? []).some(
      (i: any) => i?.product?.seller?.id === store.sellerId
    )
    if (!mine) {
      await sendTelegramText(chatId, "That order is not in your store.")
      return
    }
    const marketplace: MarketplaceModuleService =
      req.scope.resolve(MARKETPLACE_MODULE)
    const count = await marketplace.markOrderShipped(orderId)
    await sendTelegramText(
      chatId,
      count > 0
        ? "Marked shipped. The buyer sees it is en route."
        : "Already marked shipped."
    )
  } catch {
    await sendTelegramText(chatId, "Could not update it. Try Manage Business.")
  }
}

// Fulfil from chat: mark the order delivered (starts the return window,
// mirroring Manage Business). Ownership re-checked: the order must belong
// to this seller's store.
async function handleOrderDelivered(
  req: MedusaRequest,
  chatId: string,
  store: { sellerId: string },
  orderId: string
): Promise<void> {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: [order] } = (await query.graph({
      entity: "order",
      fields: ["id", "items.product.seller.id"],
      filters: { id: [orderId] },
    }).catch(() => ({ data: [] }))) as { data: any[] }
    const mine = ((order as any)?.items ?? []).some(
      (i: any) => i?.product?.seller?.id === store.sellerId
    )
    if (!mine) {
      await sendTelegramText(chatId, "That order is not in your store.")
      return
    }
    const marketplace: MarketplaceModuleService =
      req.scope.resolve(MARKETPLACE_MODULE)
    const count = await marketplace.markOrderDelivered(orderId)
    await sendTelegramText(
      chatId,
      count > 0
        ? "Marked delivered. The return window is now open."
        : "Already marked delivered."
    )
  } catch {
    await sendTelegramText(chatId, "Could not update it. Try Manage Business.")
  }
}

async function handleStore(
  req: MedusaRequest,
  chatId: string,
  store: { sellerId: string; storeName: string }
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = (await query.graph({
    entity: "seller",
    fields: ["id", "name", "handle", "verification_status"],
    filters: { id: [store.sellerId] },
  })) as { data: any[] }
  const storefront = (process.env.STOREFRONT_URL || "https://hows-u.vercel.app").replace(/\/$/, "")
  await sendTelegramText(
    chatId,
    [
      `${seller?.name ?? store.storeName} (@${seller?.handle ?? "—"})`,
      `Verified: ${seller?.verification_status ?? "unverified"}`,
      `Manage: ${storefront}/ng/seller`,
      `Use /products to list, /new to add, /edit to change, /orders for latest.`,
    ].join("\n")
  )
}

async function handleFlowText(req: MedusaRequest, chatId: string, text: string) {
  const session = getSecretarySession(chatId)
  if (!session) {
    await sendTelegramText(chatId, SECRETARY_HELP)
    return
  }
  touchSecretarySession(session)

  switch (session.step) {
    case "new_title": {
      if (!text || text.length < 2) {
        await sendTelegramText(chatId, "Please send a title (2+ characters), or /cancel.")
        return
      }
      session.draft.title = text.slice(0, 120)
      session.step = "new_price"
      touchSecretarySession(session)
      await sendTelegramText(chatId, "Price in Naira? Example: 2500")
      return
    }
    case "new_price": {
      const major = parsePriceMajor(text)
      if (major == null) {
        await sendTelegramText(chatId, "I did not catch that price. Send Naira like 2500, or /cancel.")
        return
      }
      session.draft.priceMajor = major
      session.step = "new_stock"
      touchSecretarySession(session)
      await sendTelegramText(chatId, "How many units are for sale? Send a number (0 if unsure).")
      return
    }
    case "new_stock": {
      const n = Number(text.trim())
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
        await sendTelegramText(chatId, "Send stock as a whole number 0–1000000, or /cancel.")
        return
      }
      session.draft.stock = n
      session.step = "new_photos"
      touchSecretarySession(session)
      await sendTelegramText(
        chatId,
        "Send up to 4 product photos now (one at a time). Send DONE when finished, or SKIP for no photo."
      )
      return
    }
    case "new_photos": {
      const upper = text.toUpperCase()
      if (upper === "SKIP" || upper === "DONE" || upper === "NO") {
        session.step = "new_description"
        touchSecretarySession(session)
        await sendTelegramText(chatId, "Short description? Send it, or SKIP.")
        return
      }
      await sendTelegramText(chatId, "Send a photo, or DONE to continue / SKIP for none.")
      return
    }
    case "new_description": {
      const upper = text.toUpperCase()
      session.draft.description = upper === "SKIP" ? undefined : text.slice(0, 500)
      session.step = "new_category"
      touchSecretarySession(session)
      await sendCategoryPicker(req, chatId)
      return
    }
    case "new_category": {
      await handleNewCategory(req, chatId, text)
      return
    }
    case "new_confirm": {
      const upper = text.toUpperCase()
      if (upper === "YES" || upper === "PUBLISH" || upper === "CONFIRM") {
        await handleConfirmStep(req, chatId)
        return
      }
      if (upper === "NO") {
        clearSecretarySession(chatId)
        await sendTelegramText(chatId, "Discarded. Send /new to start over.")
        return
      }
      await sendTelegramText(chatId, "Reply YES to publish, or /cancel to discard.")
      return
    }
    case "edit_pick": {
      const n = Number(text.trim())
      const list = session.edit?.list ?? []
      if (!Number.isInteger(n) || n < 1 || n > list.length) {
        await sendTelegramText(
          chatId,
          `Reply with a number 1–${list.length}, or /cancel.`
        )
        return
      }
      const picked = list[n - 1]
      session.edit = { ...session.edit, list, productId: picked.id, productTitle: picked.title }
      session.step = "edit_field"
      touchSecretarySession(session)
      await sendTelegramText(
        chatId,
        `Editing "${picked.title}". ${EDIT_FIELD_PROMPT}`
      )
      return
    }
    case "edit_field": {
      const field = normalizeEditField(text)
      if (!field) {
        await sendTelegramText(chatId, EDIT_FIELD_PROMPT)
        return
      }
      session.edit = { ...(session.edit as any), field }
      if (field === "photo") {
        session.step = "edit_photo"
        touchSecretarySession(session)
        await sendTelegramText(chatId, "Send the new cover photo now, or /cancel.")
        return
      }
      if (field === "category") {
        const cats = await listStoreCategories(req)
        if (!cats.length) {
          await sendTelegramText(chatId, "No categories exist yet — your store team adds them. Reply /edit to change something else.")
          return
        }
        session.edit = { ...(session.edit as any), list: cats }
        session.step = "edit_category"
        touchSecretarySession(session)
        await sendTelegramText(chatId, categoryPickerMessage(cats))
        return
      }
      session.step = "edit_value"
      touchSecretarySession(session)
      await sendTelegramText(chatId, editValuePrompt(field))
      return
    }
    case "edit_value": {
      await handleEditValue(req, chatId, text)
      return
    }
    case "edit_category": {
      await handleEditCategory(req, chatId, text)
      return
    }
    case "edit_photo": {
      await sendTelegramText(chatId, "Send the new cover photo now, or /cancel.")
      return
    }
    default:
      clearSecretarySession(chatId)
      await sendTelegramText(chatId, SECRETARY_HELP)
      return
  }
}

function editValuePrompt(field: "title" | "price" | "stock" | "category" | "description" | "status" | "photo"): string {
  switch (field) {
    case "title":
      return "Send the new title (2+ characters)."
    case "price":
      return "Send the new price in Naira. Example: 2500"
    case "stock":
      return "Send the new stock as a whole number."
    case "description":
      return "Send the new description (max 500 chars), or CLEAR to remove it."
    case "status":
      return "Reply PUBLISHED to show it, or DRAFT to hide it from the storefront."
    default:
      return "Send the new value."
  }
}

async function handleEditStart(
  req: MedusaRequest,
  chatId: string,
  store: { sellerId: string; sellerAdminId: string; storeName: string }
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = (await query.graph({
    entity: "seller_admin",
    fields: ["seller.products.id", "seller.products.title"],
    filters: { id: [store.sellerAdminId] },
  })) as { data: any[] }
  const products = (data?.[0]?.seller?.products ?? []) as any[]
  if (!products.length) {
    await sendTelegramText(
      chatId,
      `${store.storeName} has no products yet. Send /new to create one.`
    )
    return
  }
  const list = products
    .slice(0, 10)
    .map((p: any) => ({ id: String(p.id), title: String(p.title ?? "Untitled") }))
  if (list.length === 1) {
    const s = startSecretarySession({
      chatId,
      sellerId: store.sellerId,
      sellerAdminId: store.sellerAdminId,
      storeName: store.storeName,
      step: "edit_field",
    })
    s.edit = { list, productId: list[0].id, productTitle: list[0].title }
    touchSecretarySession(s)
    await sendTelegramText(
      chatId,
      `Editing "${list[0].title}". ${EDIT_FIELD_PROMPT}`
    )
    return
  }
  const s = startSecretarySession({
    chatId,
    sellerId: store.sellerId,
    sellerAdminId: store.sellerAdminId,
    storeName: store.storeName,
    step: "edit_pick",
  })
  s.edit = { list }
  touchSecretarySession(s)
  await sendTelegramText(
    chatId,
    [`Which product? Reply with the number:`, ...list.map((p, i) => `${i + 1}. ${p.title}`)].join("\n")
  )
}

async function singleVariantId(req: MedusaRequest, productId: string): Promise<string | null> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = (await query.graph({
    entity: "product_variant",
    fields: ["id"],
    filters: { product_id: [productId] },
  })) as { data: any[] }
  if ((data ?? []).length !== 1 || !data[0]?.id) return null
  return String(data[0].id)
}

async function handleEditValue(req: MedusaRequest, chatId: string, text: string) {
  const session = getSecretarySession(chatId)
  const edit = session?.edit
  if (!session || !edit?.productId || !edit?.field) {
    clearSecretarySession(chatId)
    await sendTelegramText(chatId, "That edit expired. Send /edit to start over.")
    return
  }
  const label = edit.productTitle ?? "product"

  try {
    switch (edit.field) {
      case "title": {
        if (!text || text.trim().length < 2) {
          await sendTelegramText(chatId, "Send a title with 2+ characters, or /cancel.")
          return
        }
        await updateSellerProductWorkflow(req.scope).run({
          input: {
            seller_admin_id: session.sellerAdminId,
            product_id: edit.productId,
            update: { title: text.trim().slice(0, 120) },
          },
        })
        break
      }
      case "description": {
        const upper = text.trim().toUpperCase()
        await updateSellerProductWorkflow(req.scope).run({
          input: {
            seller_admin_id: session.sellerAdminId,
            product_id: edit.productId,
            update: {
              description: upper === "CLEAR" ? "" : text.slice(0, 500),
            },
          },
        })
        break
      }
      case "status": {
        const status = parseStatusValue(text)
        if (!status) {
          await sendTelegramText(chatId, "Reply PUBLISHED or DRAFT, or /cancel.")
          return
        }
        await updateSellerProductWorkflow(req.scope).run({
          input: {
            seller_admin_id: session.sellerAdminId,
            product_id: edit.productId,
            update: { status },
          },
        })
        break
      }
      case "price": {
        const major = parsePriceMajor(text)
        if (major == null) {
          await sendTelegramText(chatId, "I did not catch that price. Send Naira like 2500, or /cancel.")
          return
        }
        const variantId = await singleVariantId(req, edit.productId)
        if (!variantId) {
          clearSecretarySession(chatId)
          await sendTelegramText(
            chatId,
            "That product has several variants — set its prices in Manage Business → Products."
          )
          return
        }
        await updateSellerProductWorkflow(req.scope).run({
          input: {
            seller_admin_id: session.sellerAdminId,
            product_id: edit.productId,
            update: {},
            variants: [{ id: variantId, price: Math.round(major * 100) }],
          },
        })
        clearSecretarySession(chatId)
        await sendTelegramText(chatId, `Done: "${label}" is now ${formatNgnMajor(major)}.`)
        return
      }
      case "stock": {
        const n = Number(text.trim())
        if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
          await sendTelegramText(chatId, "Send stock as a whole number 0–1000000, or /cancel.")
          return
        }
        const variantId = await singleVariantId(req, edit.productId)
        if (!variantId) {
          clearSecretarySession(chatId)
          await sendTelegramText(
            chatId,
            "That product has several variants — set stock in Manage Business → Products."
          )
          return
        }
        await updateSellerProductWorkflow(req.scope).run({
          input: {
            seller_admin_id: session.sellerAdminId,
            product_id: edit.productId,
            update: {},
            variants: [{ id: variantId, stock: n }],
          },
        })
        clearSecretarySession(chatId)
        await sendTelegramText(chatId, `Done: "${label}" stock is now ${n}.`)
        return
      }
      default:
        clearSecretarySession(chatId)
        await sendTelegramText(chatId, "That edit expired. Send /edit to start over.")
        return
    }
    clearSecretarySession(chatId)
    await sendTelegramText(chatId, `Done: "${label}" updated. Send /edit for another change.`)
  } catch {
    clearSecretarySession(chatId)
    await sendTelegramText(
      chatId,
      "That update failed on the store side. Nothing changed — try /edit again or use Manage Business → Products."
    )
  }
}

async function handleEditPhoto(req: MedusaRequest, chatId: string, fileId: string) {
  const session = getSecretarySession(chatId)
  const edit = session?.edit
  if (!session || !edit?.productId) {
    clearSecretarySession(chatId)
    await sendTelegramText(chatId, "That edit expired. Send /edit to start over.")
    return
  }
  const bytes = await downloadTelegramFile(fileId)
  if (!bytes) {
    await sendTelegramText(chatId, "That photo did not download. Try another, or /cancel.")
    return
  }
  const url = await storeTelegramPhoto(bytes, req.scope)
  if (!url) {
    await sendTelegramText(chatId, "That file did not work as a photo. Send a JPG, PNG, or camera shot under 10MB, or /cancel.")
    return
  }
  try {
    await updateSellerProductWorkflow(req.scope).run({
      input: {
        seller_admin_id: session.sellerAdminId,
        product_id: edit.productId,
        update: { thumbnail: url, images: [{ url }] },
      },
    })
    const label = edit.productTitle ?? "product"
    clearSecretarySession(chatId)
    await sendTelegramText(chatId, `Done: "${label}" has a new cover photo.`)
  } catch {
    clearSecretarySession(chatId)
    await sendTelegramText(
      chatId,
      "That update failed on the store side. Nothing changed — try /edit again or use Manage Business → Products."
    )
  }
}

async function handlePhotoStep(req: MedusaRequest, chatId: string, fileId: string) {
  const session = getSecretarySession(chatId)
  if (!session || session.step !== "new_photos") return
  if (session.draft.photos.length >= 4) {
    session.step = "new_description"
    touchSecretarySession(session)
    await sendTelegramText(chatId, "4 photos attached — the max. Short description? Send it, or SKIP.")
    return
  }
  const bytes = await downloadTelegramFile(fileId)
  if (!bytes) {
    await sendTelegramText(chatId, "That photo did not download. Try another, or DONE to continue.")
    return
  }
  const url = await storeTelegramPhoto(bytes, req.scope)
  if (!url) {
    await sendTelegramText(chatId, "That file did not work as a photo. Send a JPG, PNG, or camera shot under 10MB, or DONE.")
    return
  }
  session.draft.photos.push(url)
  touchSecretarySession(session)
  const more =
    session.draft.photos.length >= 4
      ? "4 photos attached — the max."
      : `Photo ${session.draft.photos.length} saved. Send another, or DONE.`
  if (session.draft.photos.length >= 4) {
    session.step = "new_description"
    touchSecretarySession(session)
    await sendTelegramText(chatId, `${more} Short description? Send it, or SKIP.`)
    return
  }
  await sendTelegramText(chatId, more)
}

async function handleConfirmStep(req: MedusaRequest, chatId: string) {
  const session = getSecretarySession(chatId)
  if (!session || session.step !== "new_confirm") {
    // Confirm button with no pending draft — ignore quietly.
    return
  }
  const draft = session.draft
  if (!draft.title || draft.priceMajor == null || draft.stock == null) {
    clearSecretarySession(chatId)
    await sendTelegramText(chatId, "That draft is incomplete. Send /new to start over.")
    return
  }
  try {
    const amount = Math.round(draft.priceMajor * 100)
    const photos = draft.photos.slice(0, 4)
    const { result } = await createSellerProductWorkflow(req.scope).run({
      input: {
        seller_admin_id: session.sellerAdminId,
        product: {
          title: draft.title,
          description: draft.description,
          status: "published",
          category_ids: draft.categoryId ? [draft.categoryId] : undefined,
          thumbnail: photos[0] ?? null,
          images: photos.map((url) => ({ url })),
          options: [{ title: "One Size", values: ["One Size"] }],
          variants: [
            {
              title: "One Size",
              manage_inventory: true,
              options: { "One Size": "One Size" },
              prices: [{ currency_code: "ngn", amount }],
            },
          ],
        } as any,
        stocks: [draft.stock],
      },
    })
    clearSecretarySession(chatId)
    await sendTelegramText(
      chatId,
      `Published: ${draft.title} — ${formatNgnMajor(draft.priceMajor)} · stock ${draft.stock}. Product ${(result.product as any)?.id ?? ""} is live in your store. Send /new for another.`
    )
  } catch {
    clearSecretarySession(chatId)
    await sendTelegramText(
      chatId,
      "Publishing failed on the store side. Nothing was lost — send /new to try again, or use Manage Business → Products."
    )
  }
}

async function listStoreCategories(
  req: MedusaRequest
): Promise<{ id: string; title: string }[]> {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = (await query.graph({
      entity: "product_category",
      fields: ["id", "name"],
    })) as { data: any[] }
    return (data ?? [])
      .filter((c) => c?.id)
      .map((c) => ({ id: String(c.id), title: String(c.name ?? "Untitled") }))
      .slice(0, 20)
  } catch {
    return []
  }
}

function categoryPickerMessage(cats: { id: string; title: string }[]): string {
  return [
    `Which category? Reply with the number:`,
    ...cats.map((c, i) => `${i + 1}. ${c.title}`),
    ``,
    `Or reply SKIP for no category.`,
  ].join("\n")
}

async function sendCategoryPicker(req: MedusaRequest, chatId: string): Promise<void> {
  const cats = await listStoreCategories(req)
  if (!cats.length) {
    const session = getSecretarySession(chatId)
    if (session) {
      session.step = "new_confirm"
      touchSecretarySession(session)
      await sendTelegramText(chatId, newProductSummary(session.draft))
    }
    return
  }
  const session = getSecretarySession(chatId)
  if (session) {
    session.edit = { list: cats }
    touchSecretarySession(session)
  }
  await sendTelegramText(chatId, categoryPickerMessage(cats))
}

async function handleNewCategory(req: MedusaRequest, chatId: string, text: string): Promise<void> {
  const session = getSecretarySession(chatId)
  if (!session || session.step !== "new_category") return
  const upper = text.trim().toUpperCase()
  const cats = session.edit?.list ?? []
  if (upper === "SKIP" || upper === "NO" || upper === "NONE") {
    session.draft.categoryId = undefined
    session.draft.categoryName = undefined
    session.edit = undefined
    session.step = "new_confirm"
    touchSecretarySession(session)
    await sendTelegramText(chatId, newProductSummary(session.draft))
    return
  }
  const n = Number(text.trim())
  if (!Number.isInteger(n) || n < 1 || n > cats.length) {
    await sendTelegramText(
      chatId,
      cats.length
        ? `Reply with a number 1–${cats.length}, or SKIP for no category.`
        : `Reply SKIP to continue without a category.`
    )
    return
  }
  const picked = cats[n - 1]
  session.draft.categoryId = picked.id
  session.draft.categoryName = picked.title
  session.edit = undefined
  session.step = "new_confirm"
  touchSecretarySession(session)
  await sendTelegramText(chatId, newProductSummary(session.draft))
}

async function handleEditCategory(req: MedusaRequest, chatId: string, text: string): Promise<void> {
  const session = getSecretarySession(chatId)
  const edit = session?.edit
  if (!session || !edit?.productId) {
    clearSecretarySession(chatId)
    await sendTelegramText(chatId, "That edit expired. Send /edit to start over.")
    return
  }
  const upper = text.trim().toUpperCase()
  const cats = edit.list ?? []
  const label = edit.productTitle ?? "product"
  let categoryIds: string[]
  let doneMsg: string
  if (upper === "NONE" || upper === "CLEAR" || upper === "SKIP") {
    categoryIds = []
    doneMsg = `Done: "${label}" has no category now.`
  } else {
    const n = Number(text.trim())
    if (!Number.isInteger(n) || n < 1 || n > cats.length) {
      await sendTelegramText(
        chatId,
        `Reply with a number 1–${cats.length}, NONE to clear, or /cancel.`
      )
      return
    }
    const picked = cats[n - 1]
    categoryIds = [picked.id]
    doneMsg = `Done: "${label}" is now in ${picked.title}.`
  }
  try {
    await updateSellerProductWorkflow(req.scope).run({
      input: {
        seller_admin_id: session.sellerAdminId,
        product_id: edit.productId,
        update: { category_ids: categoryIds },
      },
    })
    clearSecretarySession(chatId)
    await sendTelegramText(chatId, doneMsg)
  } catch {
    clearSecretarySession(chatId)
    await sendTelegramText(
      chatId,
      "That update failed on the store side. Nothing changed — try /edit again or use Manage Business → Products."
    )
  }
}

function proofKeyboard(orderId: string, manageUrl: string) {
  return {
    inline_keyboard: [
      [
        { text: "Confirm payment", callback_data: `proof:confirm:${orderId}` },
        { text: "Reject", callback_data: `proof:reject:${orderId}` },
      ],
      [{ text: "Review proof", url: manageUrl }],
    ],
  }
}

function storefrontBase(): string {
  return (process.env.STOREFRONT_URL || "https://hows-u.vercel.app").replace(/\/$/, "")
}

// One-click payment verdicts from the proof alert buttons. Confirm settles
// the order (buyer notice + courier auto-post, mirroring Manage Business).
// Reject swaps the buttons for reason picks, then rejects with that note.
async function handleProofCallback(
  req: MedusaRequest,
  chatId: string,
  messageId: number | undefined,
  data: string
): Promise<void> {
  const store = await findStoreByChat(req, chatId).catch(() => null)
  if (!store) {
    await sendTelegramText(chatId, "This chat is not linked to a store.")
    return
  }
  const parts = data.split(":")
  const action = parts[1]
  const orderId = parts[2]
  if (!orderId) return

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  const manageUrl = `${storefrontBase()}/ng/seller/orders`

  if (action === "reject" && messageId) {
    await editTelegramButtons(chatId, messageId, {
      inline_keyboard: [
        PROOF_REJECT_REASONS.slice(0, 2).map((r) => ({
          text: r.label,
          callback_data: `proof:reason:${orderId}:${r.key}`,
        })),
        PROOF_REJECT_REASONS.slice(2).map((r) => ({
          text: r.label,
          callback_data: `proof:reason:${orderId}:${r.key}`,
        })),
        [{ text: "Back", callback_data: `proof:back:${orderId}` }],
      ],
    })
    return
  }

  if (action === "back" && messageId) {
    await editTelegramButtons(chatId, messageId, proofKeyboard(orderId, manageUrl))
    return
  }

  if (action === "reason") {
    const reason = PROOF_REJECT_REASONS.find((r) => r.key === parts[3])
    if (!reason) return
    try {
      const proof = await marketplace.rejectBankTransferProof(
        orderId,
        store.sellerId,
        reason.note
      )
      await sendBankTransferNotice(req.scope, {
        to: proof.buyer_email,
        recipient: "buyer",
        kind: "bank_transfer_rejected",
        subject: "The store couldn't find your bank transfer",
        bodyHtml: `The store could not find the transfer for order ${proof.order_id}. Their note: "${proof.rejection_note}". If the money is still on its way, it can still be confirmed once it lands.`,
        payload: { order_id: proof.order_id, rejection_note: proof.rejection_note },
      })
      await sendTelegramText(chatId, `Rejected (${reason.note}). The buyer can re-upload.`)
    } catch {
      await sendTelegramText(chatId, "That order is no longer awaiting verdict.")
    }
    return
  }

  if (action === "confirm") {
    try {
      const proof = await marketplace.confirmBankTransferProof(orderId, store.sellerId)
      await sendBankTransferNotice(req.scope, {
        to: proof.buyer_email,
        recipient: "buyer",
        kind: "bank_transfer_confirmed",
        subject: "Your bank transfer was confirmed",
        bodyHtml: `The store confirmed your bank transfer for order ${proof.order_id}. Reference: ${proof.reference}.`,
        payload: { order_id: proof.order_id, reference: proof.reference },
      })
      const auto = await maybeAutoPostCourierJob(req.scope, {
        orderId,
        sellerId: store.sellerId,
        buyerEmail: proof.buyer_email,
      })
      await sendTelegramText(
        chatId,
        auto.posted
          ? `Payment confirmed. Courier job posted to the board.`
          : `Payment confirmed. Fulfil the order in Manage Business.`
      )
    } catch {
      await sendTelegramText(chatId, "That order is no longer awaiting verdict.")
    }
    return
  }
}

async function answerCallback(callbackId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // Spinner dismissal is cosmetic.
  }
}

