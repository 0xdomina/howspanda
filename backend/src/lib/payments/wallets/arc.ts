import {
  UserWallet,
  UserWalletSigner,
  WalletSpendResult,
  WalletUnavailableError,
} from "./adapter"

// Arc: USDC is the native gas token (18 decimals) with an optional ERC-20
// interface (6 decimals) over the same balance. User wallets are derived from
// the platform master key (dev-controlled / managed wallet) so the DB only
// ever holds public addresses.
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

// Same lazy-import strategy as the settlement adapter: `viem` is ESM-tagged
// and only loaded at runtime on the first real chain call (mock never loads it).
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

function rpcUrl(): string {
  return process.env.ARC_RPC_URL || "https://rpc.testnet.arc.io"
}

async function signer(index: number): Promise<any> {
  const mod = await accountsMod()
  if (process.env.ARC_MNEMONIC) {
    return mod.mnemonicToAccount(process.env.ARC_MNEMONIC, {
      addressIndex: index,
    })
  }
  if (process.env.ARC_PRIVATE_KEY) {
    return mod.privateKeyToAccount(process.env.ARC_PRIVATE_KEY)
  }
  throw new WalletUnavailableError(
    "Arc wallets are not configured: set ARC_MNEMONIC (or ARC_PRIVATE_KEY)."
  )
}

/**
 * Live per-user USDC wallets on Arc Testnet. The platform holds the master
 * key; each user's spend is a signed native-USDC transfer from their derived
 * address. Balance reads go through the ERC-20 interface (6 decimals).
 */
export class ArcUserWalletSigner implements UserWalletSigner {
  readonly network = "arc" as const
  readonly env = "testnet" as const

  async deriveWallet(derivationIndex: number): Promise<UserWallet> {
    const account = await signer(derivationIndex)
    return {
      network: this.network,
      env: this.env,
      address: account.address,
      derivation_index: derivationIndex,
    }
  }

  async balanceOf(address: string): Promise<string> {
    const viem = await viemMod()
    const client = viem.createPublicClient({
      chain: ARC_CHAIN,
      transport: viem.http(rpcUrl()),
    })
    try {
      const balance = (await client.readContract({
        address: USDC_ERC20,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [address],
      })) as bigint
      // 6-decimal USDC string (X.YZ).
      const whole = balance / 1000000n
      const frac = balance % 1000000n
      return `${whole}.${frac.toString().padStart(6, "0").slice(0, 6)}`
    } catch (e: any) {
      throw new WalletUnavailableError(
        `Arc balance read failed (is the RPC reachable?): ${e?.message ?? e}`
      )
    }
  }

  async spend(input: {
    derivationIndex: number
    to: string
    usdc_amount: string
    reference: string
  }): Promise<WalletSpendResult> {
    const viem = await viemMod()
    const account = await signer(input.derivationIndex)
    const client = viem.createWalletClient({
      account,
      chain: ARC_CHAIN,
      transport: viem.http(rpcUrl()),
    })
    try {
      const hash = await client.sendTransaction({
        to: input.to,
        // Native USDC is the gas token: value transfer in 18 decimals.
        value: viem.parseUnits(input.usdc_amount, 18),
      })
      return { status: "pending", tx_hash: hash }
    } catch (e: any) {
      throw new WalletUnavailableError(
        `Arc spend failed (is the wallet funded for gas?): ${e?.message ?? e}`
      )
    }
  }

  async checkSpend(input: {
    reference: string
    tx_hash?: string | null
    provider_id?: string | null
  }): Promise<WalletSpendResult> {
    // Real receipt polling: the spend row's tx_hash (returned at broadcast)
    // drives the verdict. A missing receipt simply means the tx is still in
    // the mempool — leave it signed for the next reconcile sweep.
    if (!input.tx_hash) {
      return { status: "pending" }
    }
    const viem = await viemMod()
    const client = viem.createPublicClient({
      chain: ARC_CHAIN,
      transport: viem.http(rpcUrl()),
    })
    try {
      const receipt = await client.getTransactionReceipt({
        hash: input.tx_hash,
      })
      if (!receipt) {
        return { status: "pending" }
      }
      if (receipt.status === "success") {
        return { status: "confirmed", tx_hash: input.tx_hash }
      }
      return { status: "failed", tx_hash: input.tx_hash }
    } catch {
      // Receipt not found yet (pending in the mempool).
      return { status: "pending" }
    }
  }
}
