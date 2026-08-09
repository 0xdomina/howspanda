import { registerCapability } from "../harness"
import { registerMockOutput } from "../model"

// Buyer chat capability — registered once at module load so the harness
// allowlist and the deterministic mock stay in sync. Chat is advice only:
// no readers, no side effects (the AI can never touch money, orders,
// inventory, or payment rails).

registerCapability({
  key: "chat",
  actor: "buyer",
  label: "Buyer chat assistant",
  readers: [],
  sideEffects: "none",
})

registerCapability({
  key: "seller_chat",
  actor: "seller",
  label: "Seller chat assistant",
  readers: [],
  sideEffects: "none",
})

registerMockOutput(
  "chat",
  "Mock reply: here is a helpful, marketplace-grounded answer for the buyer."
)
registerMockOutput(
  "seller_chat",
  "Mock reply: here is a helpful, store-grounded answer for the seller."
)

export const BUYER_CHAT_SYSTEM_PROMPT =
  "[capability:chat] You are a friendly shopping assistant on How's u, an " +
  "African marketplace. You help buyers with general questions about shopping, " +
  "products, and using the marketplace. You give advice and information only — " +
  "you can never change prices, orders, payments, inventory, or payouts. " +
  "Answer conversationally and concisely. Never invent facts about the user's " +
  "orders, account, or balance."

export const SELLER_CHAT_SYSTEM_PROMPT =
  "[capability:seller_chat] You are a store-owner assistant on How's u. You " +
  "answer general questions about running a store on the marketplace. You give " +
  "advice only — you can never change prices, orders, inventory, or payouts. " +
  "Answer conversationally and concisely. Never invent facts about the seller's " +
  "data or the marketplace."
