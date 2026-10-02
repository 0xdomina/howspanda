import type { Chain } from "viem" with { "resolution-mode": "import" }

// viem ships ESM-only while this codebase compiles to CJS, so values load
// lazily via dynamic import (types stay static and vanish at compile).
async function viem() {
  const [{ createPublicClient, createWalletClient, http }, { privateKeyToAccount }, { polygon }] =
    await Promise.all([
      import("viem"),
      import("viem/accounts"),
      import("viem/chains"),
    ])
  return { createPublicClient, createWalletClient, http, privateKeyToAccount, polygon }
}

// Generic EVM money rail. Any network is a chain config + RPC + token
// contract — Arc-direct, bsc, somnia plug in here without touching callers.
// Keys never leave this module boundary: callers pass one in, nothing logs it.

export type EvmChainConfig = {
  chain: Chain
  rpcUrl: string
  usdtContract?: `0x${string}`
}

export async function polygonConfig(): Promise<EvmChainConfig> {
  const { polygon } = await viem()
  const rpc = process.env.NIMIQ_USDT_RPC || "https://polygon-rpc.com"
  return {
    chain: polygon,
    rpcUrl: rpc,
    usdtContract: (process.env.NIMIQ_USDT_CONTRACT ||
      "0xc2132D05D31c914a87C6611C10748AEb04B58e8F") as `0x${string}`,
  }
}

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const

function key(): `0x${string}` {
  const k = (process.env.NIMIQ_HOT_WALLET_KEY ?? "").trim()
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error("Hot wallet is not configured")
  }
  return k as `0x${string}`
}

/** Per-transaction ceiling (USDT major). Real money needs a hard cap. */
export function payoutCapMajor(): number {
  const cap = Number(process.env.NIMIQ_PAYOUT_MAX_USDT)
  if (Number.isFinite(cap) && cap > 0) return cap
  return 500
}

/** Send USDT. Returns the tx hash. Throws on any failure. */
export async function sendUsdt(input: {
  cfg: EvmChainConfig
  to: string
  baseUnits: bigint
}): Promise<`0x${string}`> {
  const { createWalletClient, http, privateKeyToAccount } = await viem()
  const account = privateKeyToAccount(key())
  const client = createWalletClient({
    account,
    chain: input.cfg.chain,
    transport: http(input.cfg.rpcUrl, { timeout: 20_000 }),
  })
  return client.writeContract({
    address: input.cfg.usdtContract!,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [input.to as `0x${string}`, input.baseUnits],
  })
}

export type ReceiptCheck =
  | { ok: true; confirmations: number }
  | { ok: false; reason: string }

/** Poll a receipt until depth or timeout. Fail-closed. */
export async function waitReceipt(
  cfg: EvmChainConfig,
  txHash: `0x${string}`,
  minConfirmations: number,
  timeoutMs = 120_000
): Promise<ReceiptCheck> {
  const { createPublicClient, http } = await viem()
  const client = createPublicClient({
    chain: cfg.chain,
    transport: http(cfg.rpcUrl, { timeout: 20_000 }),
  })
  const start = Date.now()
  for (;;) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash })
      if (receipt && receipt.status === "success") {
        const head = await client.getBlockNumber()
        const conf = Number(head - receipt.blockNumber)
        if (conf >= minConfirmations) return { ok: true, confirmations: conf }
      } else if (receipt) {
        return { ok: false, reason: "Transaction reverted" }
      }
    } catch {
      // Not mined yet — keep polling.
    }
    if (Date.now() - start > timeoutMs) {
      return { ok: false, reason: "Confirmation timed out" }
    }
    await new Promise((r) => setTimeout(r, 5_000))
  }
}
