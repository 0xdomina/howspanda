import { createHash } from "node:crypto"
import {
  CryptoNetwork,
  CryptoSettlement,
  CryptoUnavailableError,
  DepositIntent,
  NetworkEnv,
  SettlementQuery,
  SettlementStatus,
  WithdrawalStatus,
} from "./adapter"

// Arc is Circle's purpose-built L1 for stablecoin finance: USDC is the NATIVE
// gas token (18 decimals) and an optional ERC-20 interface (6 decimals) reads
// and moves the same underlying balance. Sub-second deterministic finality.
// Testnet only today.
//
// Chain config (docs.arc.io/references/connect-to-arc):
//   RPC        https://rpc.testnet.arc.io   (env ARC_RPC_URL to override)
//   Chain ID   5042002
//   Explorer   https://testnet.arcscan.app
//   Faucet     https://faucet.circle.com  (Arc Testnet + USDC)
const ARC_CHAIN = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
}

// Optional ERC-20 interface for the native USDC balance (6 decimals).
const USDC_ERC20 = "0x3600000000000000000000000000000000000000"
const USDC_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
]

const INTENT_TTL_MS = 30 * 60 * 1000
const TREASURY_INDEX = 0

// Withdrawal tx hashes keyed by payout reference — survives within-process
// reconcile polls; a process restart relies on the DB payout row's own
// provider_reference to resume tracking.
const WITHDRAWAL_HASHES = new Map<string, string>()

// viem is loaded through lazy dynamic imports (both `viem` and `viem/accounts`
// are ESM-tagged and trip TS's Node16 CJS resolution — TS1479). Keeping the
// specifier literal still lets tsc type the import as `any`, and the module is
// only pulled in at runtime on the first chain call (mock mode never loads it).
let viemPromise: Promise<any> | undefined
function viemMod(): Promise<any> {
  if (!viemPromise) {
    viemPromise = import("viem")
  }
  return viemPromise
}

let accountsPromise: Promise<any> | undefined
function accountsMod(): Promise<any> {
  if (!accountsPromise) {
    accountsPromise = import("viem/accounts")
  }
  return accountsPromise
}

export function isArcConfigured(): boolean {
  return !!(process.env.ARC_MNEMONIC || process.env.ARC_PRIVATE_KEY)
}

function rpcUrl(): string {
  return process.env.ARC_RPC_URL || "https://rpc.testnet.arc.io"
}

/**
 * Deterministic per-intent deposit address: index derived from the reference
 * so the same reference always maps to the same address across restarts, and
 * every intent has its own address (no cross-intent correlation). Only works
 * with a mnemonic — a raw private key falls back to a single shared address.
 */
function depositIndex(reference: string): number {
  return (
    createHash("sha256").update(reference).digest().readUInt32BE(0) & 0x7fffffff
  )
}

async function signer(index: number): Promise<any> {
  const mod = await accountsMod()
  if (process.env.ARC_MNEMONIC) {
    return mod.mnemonicToAccount(process.env.ARC_MNEMONIC, { addressIndex: index })
  }
  if (process.env.ARC_PRIVATE_KEY) {
    return mod.privateKeyToAccount(process.env.ARC_PRIVATE_KEY)
  }
  throw new CryptoUnavailableError(
    "Arc rail is not configured: set ARC_MNEMONIC (or ARC_PRIVATE_KEY) and fund " +
      "the derived address with testnet USDC from https://faucet.circle.com."
  )
}

/**
 * Live USDC settlement on Arc Testnet via a dev-controlled wallet (the
 * platform holds the key — buyers never touch a wallet or seed phrase, matching
 * the managed-wallet UX). Payments are native USDC transfers to per-intent
 * derived addresses; payouts are native USDC transfers out of the treasury.
 */
export class ArcCryptoSettlement implements CryptoSettlement {
  readonly network: CryptoNetwork = "arc"
  readonly env: NetworkEnv = "testnet"

  async createDepositIntent(input: {
    reference: string
    usdc_amount: string
  }): Promise<DepositIntent> {
    const account = await signer(depositIndex(input.reference))
    return {
      network: this.network,
      env: this.env,
      address: account.address,
      usdc_amount: input.usdc_amount,
      reference: input.reference,
      // Single shared address when using ARC_PRIVATE_KEY; per-intent addresses
      // when using ARC_MNEMONIC. Either way settlement is scoped by expected
      // amount, so an under-payment never confirms.
      wallet_id: `arc-${input.reference}`,
      expires_at: new Date(Date.now() + INTENT_TTL_MS).toISOString(),
    }
  }

  async checkSettlement(query: SettlementQuery): Promise<SettlementStatus> {
    const { reference, expected_usdc } = query
    const account = await signer(depositIndex(reference))

    let balance: bigint
    try {
      const viem = await viemMod()
      const client = viem.createPublicClient({
        chain: ARC_CHAIN,
        transport: viem.http(rpcUrl()),
      })
      // Read through the ERC-20 interface so the number is USDC in 6 decimals
      // (the native gas token is 18 decimals — never mix the two).
      balance = (await client.readContract({
        address: USDC_ERC20,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [account.address],
      })) as bigint
    } catch (e: any) {
      throw new CryptoUnavailableError(
        `Arc settlement check failed (is the RPC reachable?): ${e?.message ?? e}`
      )
    }

    const expected = viemBigint(await viemMod(), expected_usdc ?? "0")
    if (balance >= expected) {
      return {
        reference,
        status: "confirmed",
        usdc_received: String(balance / 1000000n),
      }
    }
    return { reference, status: "pending" }
  }

  async createWithdrawal(input: {
    reference: string
    address: string
    usdc_amount: string
  }): Promise<WithdrawalStatus> {
    const account = await signer(TREASURY_INDEX)
    let hash: string
    try {
      const viem = await viemMod()
      const client = viem.createWalletClient({
        account,
        chain: ARC_CHAIN,
        transport: viem.http(rpcUrl()),
      })
      // Native USDC is the gas token: a plain value transfer in 18 decimals.
      hash = await client.sendTransaction({
        to: input.address,
        value: viem.parseUnits(input.usdc_amount, 18),
      })
    } catch (e: any) {
      throw new CryptoUnavailableError(
        `Arc withdrawal failed (is the treasury funded for gas?): ${e?.message ?? e}`
      )
    }

    WITHDRAWAL_HASHES.set(input.reference, hash)
    return { reference: input.reference, status: "pending", tx_hash: hash }
  }

  async checkWithdrawal(reference: string): Promise<WithdrawalStatus> {
    const hash = WITHDRAWAL_HASHES.get(reference)
    if (!hash) {
      return { reference, status: "pending" }
    }
    try {
      const viem = await viemMod()
      const client = viem.createPublicClient({
        chain: ARC_CHAIN,
        transport: viem.http(rpcUrl()),
      })
      const receipt = await client.getTransactionReceipt({ hash })
      if (!receipt) {
        return { reference, status: "pending" }
      }
      if (receipt.status === "success") {
        return { reference, status: "confirmed", tx_hash: hash }
      }
      return { reference, status: "failed", tx_hash: hash }
    } catch {
      // Receipt not found yet (pending in the mempool).
      return { reference, status: "pending" }
    }
  }
}

// 6-decimal USDC in "X.YZ" string form → native 6-dec bigint.
function viemBigint(viem: any, amount: string): bigint {
  return viem.parseUnits(amount, 6)
}