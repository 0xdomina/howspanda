// Chain verification clients. Plain fetch JSON-RPC, no new dependencies.
// Every check is fail-closed: anything unexpected returns { ok: false }.

const FETCH_TIMEOUT_MS = 15_000

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as { result?: T; error?: unknown } | null
    if (!body || body.error !== undefined) return null
    return body.result ?? null
  } catch {
    return null
  }
}

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

function hexToBigInt(hex: string): bigint {
  try {
    return BigInt(hex)
  } catch {
    return 0n
  }
}

function topicToAddress(topic: string): string {
  // Indexed address param: left-padded 32 bytes, address in last 20.
  const clean = topic.toLowerCase().replace(/^0x/, "")
  return ("0x" + clean.slice(-40)).toLowerCase()
}

export type UsdtVerifyResult =
  | { ok: true; confirmations: number }
  | { ok: false; reason: string }

function rpcUrl(): string {
  return process.env.NIMIQ_USDT_RPC || "https://polygon-rpc.com"
}

function usdtContract(): string {
  // Native USDT0 on Polygon (6 decimals). Overridable, never hardcoded blind.
  return (process.env.NIMIQ_USDT_CONTRACT || "0xc2132D05D31c914a87C6611C10748AEb04B58e8F").toLowerCase()
}

function minConfirmations(): number {
  const n = Number(process.env.NIMIQ_MIN_CONFIRMATIONS)
  return Number.isInteger(n) && n >= 0 ? n : 12
}

/**
 * Verify a Polygon USDT transfer: receipt exists + success + contract match +
 * summed Transfer(to=merchant) value covers the expected base units +
 * confirmation depth. Pure read, no wallet needed.
 */
export async function verifyUsdtTransfer(input: {
  txHash: string
  merchant: string
  expectedBaseUnits: bigint
  expectedSender?: string
}): Promise<UsdtVerifyResult> {
  const url = rpcUrl()
  const receipt = await rpc<{
    status?: string
    to?: string
    blockNumber?: string
    logs?: { address?: string; topics?: string[]; data?: string }[]
  }>(url, "eth_getTransactionReceipt", [input.txHash])
  if (!receipt) return { ok: false, reason: "Transaction not found" }
  if (receipt.status !== "0x1") return { ok: false, reason: "Transaction failed on chain" }
  if (input.expectedSender) {
    // Bind the signer: the receipt has no `from`, so read the transaction.
    const tx = await rpc<{ from?: string }>(url, "eth_getTransactionByHash", [input.txHash])
    if (!tx?.from || tx.from.toLowerCase() !== input.expectedSender.toLowerCase()) {
      return { ok: false, reason: "Sender mismatch" }
    }
  }
  const contract = usdtContract()
  const merchant = input.merchant.toLowerCase()
  let credited = 0n
  for (const log of receipt.logs ?? []) {
    if ((log.address ?? "").toLowerCase() !== contract) continue
    const topics = log.topics ?? []
    if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue
    if (topics.length < 3 || topicToAddress(topics[2]) !== merchant) continue
    credited += hexToBigInt(log.data ?? "0x0")
  }
  if (credited < input.expectedBaseUnits) {
    return { ok: false, reason: "Amount or destination mismatch" }
  }
  const head = await rpc<string>(url, "eth_blockNumber", [])
  const headNum = head ? Number.parseInt(head, 16) : NaN
  const atNum = receipt.blockNumber ? Number.parseInt(receipt.blockNumber, 16) : NaN
  const confirmations =
    Number.isFinite(headNum) && Number.isFinite(atNum) ? Math.max(0, headNum - atNum) : 0
  if (confirmations < minConfirmations()) {
    return { ok: false, reason: `Needs ${minConfirmations()} confirmations` }
  }
  return { ok: true, confirmations }
}

/** Luna helpers for the NIM path (verification endpoint configured later). */
export const LUNA_PER_NIM = 100_000

export function nimToLuna(nimMajor: number): bigint {
  return BigInt(Math.round(nimMajor * LUNA_PER_NIM))
}
