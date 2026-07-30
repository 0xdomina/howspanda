import {
  CIRCLE_BLOCKCHAIN,
  CryptoNetwork,
  CryptoSettlement,
  CryptoUnavailableError,
  DepositIntent,
  NetworkEnv,
  SettlementStatus,
} from "./adapter"

export type CircleOptions = {
  apiKey: string
  entitySecret?: string
  walletSetId?: string
}

// Reuse one receiving wallet per (network,env) across requests within a
// process, so we don't spin up a new Circle wallet on every checkout.
const WALLET_CACHE = new Map<string, { id: string; address: string }>()

/**
 * Live settlement via Circle developer-controlled wallets (USDC-native, no
 * user seed phrase). The SDK is loaded through an INDIRECT dynamic import so
 * the backend boots and `tsc` passes even when the package isn't installed —
 * mock mode is the default and this class is only constructed when
 * `CIRCLE_API_KEY` is a real key.
 *
 * Circle's SDK surface is documented as best-effort here; confirm the exact
 * method names against the installed version before enabling live settlement.
 * The `CryptoSettlement` contract stays stable regardless.
 */
export class CircleCryptoSettlement implements CryptoSettlement {
  readonly network: CryptoNetwork
  readonly env: NetworkEnv
  private options: CircleOptions
  private clientPromise?: Promise<any>

  constructor(network: CryptoNetwork, env: NetworkEnv, options: CircleOptions) {
    this.network = network
    this.env = env
    this.options = options
  }

  private blockchain(): string {
    return CIRCLE_BLOCKCHAIN[this.network][this.env]
  }

  private async client(): Promise<any> {
    if (!this.clientPromise) {
      // Indirect specifier: TypeScript can't statically resolve a non-literal
      // import, so it stays `any` and tsc is clean without the dependency.
      const pkg = "@circle-fin/developer-controlled-wallets"
      this.clientPromise = import(pkg)
        .then((mod: any) =>
          mod.initiateDeveloperControlledWalletsClient({
            apiKey: this.options.apiKey,
            entitySecret: this.options.entitySecret,
          })
        )
        .catch((e: any) => {
          throw new CryptoUnavailableError(
            `Circle SDK unavailable (${e?.message ?? e}). Install ` +
              `@circle-fin/developer-controlled-wallets to enable live crypto.`
          )
        })
    }
    return this.clientPromise
  }

  private async receivingWallet(): Promise<{ id: string; address: string }> {
    const cacheKey = `${this.network}:${this.env}`
    const cached = WALLET_CACHE.get(cacheKey)
    if (cached) {
      return cached
    }

    const client = await this.client()
    try {
      const res = await client.createWallets({
        blockchains: [this.blockchain()],
        count: 1,
        walletSetId: this.options.walletSetId,
        accountType: "SCA",
      })
      const wallet = res?.data?.wallets?.[0]
      if (!wallet?.address || !wallet?.id) {
        throw new Error("Circle createWallets returned no wallet")
      }
      const entry = { id: wallet.id, address: wallet.address }
      WALLET_CACHE.set(cacheKey, entry)
      return entry
    } catch (e: any) {
      throw new CryptoUnavailableError(
        `Circle wallet provisioning failed: ${e?.message ?? e}`
      )
    }
  }

  async createDepositIntent(input: {
    reference: string
    usdc_amount: string
  }): Promise<DepositIntent> {
    const wallet = await this.receivingWallet()
    return {
      network: this.network,
      env: this.env,
      address: wallet.address,
      usdc_amount: input.usdc_amount,
      reference: input.reference,
      wallet_id: wallet.id,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
  }

  async checkSettlement(reference: string): Promise<SettlementStatus> {
    const wallet = WALLET_CACHE.get(`${this.network}:${this.env}`)
    if (!wallet) {
      return { reference, status: "pending" }
    }

    const client = await this.client()
    try {
      // PoC LIMITATION (must fix before live crypto): this matches ANY completed
      // inbound transfer into the SHARED receiving wallet — it does NOT correlate
      // the transfer to this `reference` or the expected `usdc_amount`. With
      // concurrent checkouts two orders could each see the other's deposit and
      // both settle. Provision a per-intent deposit address (or match by
      // amount + reference/memo) before enabling live settlement.
      const res = await client.listTransactions({
        walletIds: [wallet.id],
        blockchain: this.blockchain(),
      })
      const inbound = (res?.data?.transactions ?? []).find(
        (t: any) =>
          t?.transactionType === "INBOUND" && t?.state === "COMPLETE"
      )
      if (!inbound) {
        return { reference, status: "pending" }
      }
      return {
        reference,
        status: "confirmed",
        tx_hash: inbound.txHash,
        usdc_received: inbound.amounts?.[0],
      }
    } catch (e: any) {
      throw new CryptoUnavailableError(
        `Circle settlement check failed: ${e?.message ?? e}`
      )
    }
  }
}
