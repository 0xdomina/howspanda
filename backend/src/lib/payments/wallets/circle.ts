import { createHash, randomUUID } from "node:crypto"
import {
  initiateDeveloperControlledWalletsClient,
  type Blockchain,
  type CircleDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets"
import {
  UserWallet,
  UserWalletSigner,
  WalletSpendResult,
  WalletUnavailableError,
} from "./adapter"
import {
  CIRCLE_BLOCKCHAIN,
  CryptoNetwork,
  NetworkEnv,
} from "../crypto/adapter"

export type CircleWalletOptions = {
  apiKey: string
  entitySecret: string
  walletSetId: string
  accountType?: "EOA" | "SCA"
  baseUrl?: string
}

type CircleWallet = { id: string; address: string }

const WALLET_CACHE = new Map<string, CircleWallet>()
const PROVISIONING_CACHE = new Map<string, Promise<CircleWallet>>()
const TERMINAL_FAILURES = new Set(["FAILED", "CANCELLED", "DENIED", "STUCK"])

function deterministicUuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Server-only Circle developer-controlled wallet signer. */
export class CircleUserWalletSigner implements UserWalletSigner {
  readonly network: CryptoNetwork
  readonly env: NetworkEnv
  private readonly options: CircleWalletOptions
  private clientPromise?: Promise<CircleDeveloperControlledWalletsClient>

  constructor(
    network: CryptoNetwork,
    env: NetworkEnv,
    options: CircleWalletOptions
  ) {
    this.network = network
    this.env = env
    this.options = options
  }

  private blockchain(): Blockchain {
    return CIRCLE_BLOCKCHAIN[this.network][this.env] as Blockchain
  }

  private async client(): Promise<CircleDeveloperControlledWalletsClient> {
    if (!this.clientPromise) {
      this.clientPromise = Promise.resolve(
        initiateDeveloperControlledWalletsClient({
          apiKey: this.options.apiKey,
          entitySecret: this.options.entitySecret,
          ...(this.options.baseUrl ? { baseUrl: this.options.baseUrl } : {}),
        })
      )
    }
    return this.clientPromise
  }

  private refId(derivationIndex: number): string {
    return `user-${this.network}-${this.env}-${derivationIndex}`
  }

  private async findByRefId(refId: string): Promise<CircleWallet | null> {
    const client = await this.client()
    const response = await client.listWallets({
      walletSetId: this.options.walletSetId,
      blockchain: this.blockchain(),
      refId,
      pageSize: 50,
    })
    const wallet = response.data?.wallets?.find(
      (candidate) => candidate.refId === refId && candidate.id && candidate.address
    )
    return wallet?.id && wallet.address
      ? { id: wallet.id, address: wallet.address }
      : null
  }

  private async createOrFindWallet(refId: string): Promise<CircleWallet> {
    const cached = WALLET_CACHE.get(refId)
    if (cached) return cached

    const found = await this.findByRefId(refId)
    if (found) {
      WALLET_CACHE.set(refId, found)
      return found
    }

    const client = await this.client()
    const response = await client.createWallets({
      walletSetId: this.options.walletSetId,
      blockchains: [this.blockchain()],
      count: 1,
      accountType: this.options.accountType ?? "SCA",
      metadata: [{ name: refId, refId }],
      idempotencyKey: deterministicUuid(`wallet:${refId}`),
      xRequestId: randomUUID(),
    })
    const wallet = response.data?.wallets?.[0]
    if (!wallet?.id || !wallet.address) {
      throw new WalletUnavailableError("Circle did not return a wallet")
    }
    const entry = { id: wallet.id, address: wallet.address }
    WALLET_CACHE.set(refId, entry)
    return entry
  }

  private async walletFor(derivationIndex: number): Promise<CircleWallet> {
    const refId = this.refId(derivationIndex)
    const active = PROVISIONING_CACHE.get(refId)
    if (active) return active

    const pending = this.createOrFindWallet(refId).finally(() => {
      PROVISIONING_CACHE.delete(refId)
    })
    PROVISIONING_CACHE.set(refId, pending)
    return pending
  }

  async deriveWallet(derivationIndex: number): Promise<UserWallet> {
    const wallet = await this.walletFor(derivationIndex)
    return {
      network: this.network,
      env: this.env,
      address: wallet.address,
      derivation_index: derivationIndex,
    }
  }

  private async usdcBalance(walletId: string) {
    const client = await this.client()
    const response = await client.getWalletTokenBalance({ id: walletId })
    const usdc = response.data?.tokenBalances?.find((balance) =>
      String(balance.token?.symbol ?? "").toUpperCase().startsWith("USDC")
    )
    return { tokenId: usdc?.token?.id, amount: String(usdc?.amount ?? "0") }
  }

  async balanceOf(address: string): Promise<string> {
    const client = await this.client()
    const response = await client.listWallets({
      walletSetId: this.options.walletSetId,
      blockchain: this.blockchain(),
      address,
      pageSize: 1,
    })
    const wallet = response.data?.wallets?.[0]
    if (!wallet?.id) return "0"
    return (await this.usdcBalance(wallet.id)).amount
  }

  async spend(input: {
    derivationIndex: number
    to: string
    usdc_amount: string
    reference: string
  }): Promise<WalletSpendResult> {
    const wallet = await this.walletFor(input.derivationIndex)
    const { tokenId, amount } = await this.usdcBalance(wallet.id)
    if (!tokenId || Number(amount) < Number(input.usdc_amount)) {
      return { status: "failed" }
    }

    const client = await this.client()
    try {
      const response = await client.createTransaction({
        walletId: wallet.id,
        tokenId,
        destinationAddress: input.to,
        amount: [input.usdc_amount],
        refId: input.reference,
        idempotencyKey: deterministicUuid(`spend:${input.reference}`),
        xRequestId: randomUUID(),
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      })
      const transaction = response.data
      return {
        status: "pending",
        provider_id: transaction?.id,
      }
    } catch (error: any) {
      throw new WalletUnavailableError(
        `Circle wallet spend failed: ${error?.message ?? error}`
      )
    }
  }

  async checkSpend(input: {
    reference: string
    tx_hash?: string | null
    provider_id?: string | null
  }): Promise<WalletSpendResult> {
    const client = await this.client()
    if (!input.provider_id) return { status: "pending" }

    try {
      const response = await client.getTransaction({ id: input.provider_id })
      const transaction = response.data?.transaction
      if (!transaction) {
        return { status: "pending", provider_id: input.provider_id }
      }
      const state = String(transaction.state)
      if (state === "COMPLETE") {
        return {
          status: "confirmed",
          provider_id: transaction.id,
          tx_hash: transaction.txHash,
        }
      }
      if (TERMINAL_FAILURES.has(state)) {
        return {
          status: "failed",
          provider_id: transaction.id,
          tx_hash: transaction.txHash,
        }
      }
      return {
        status: "pending",
        provider_id: transaction.id,
        tx_hash: transaction.txHash,
      }
    } catch (error: any) {
      throw new WalletUnavailableError(
        `Circle wallet status check failed: ${error?.message ?? error}`
      )
    }
  }
}
