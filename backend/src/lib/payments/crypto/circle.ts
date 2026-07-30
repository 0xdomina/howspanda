import {
  CIRCLE_BLOCKCHAIN,
  CryptoNetwork,
  CryptoSettlement,
  CryptoUnavailableError,
  DepositIntent,
  NetworkEnv,
  SettlementQuery,
  SettlementStatus,
  WithdrawalStatus,
} from "./adapter"

export type CircleOptions = {
  apiKey: string
  entitySecret?: string
  walletSetId?: string
}

// Platform TREASURY wallet per (network,env) — outbound-only (payouts).
// Deposits get a fresh per-intent wallet instead (see createDepositIntent).
const TREASURY_CACHE = new Map<string, { id: string; address: string }>()

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

  private async provisionWallet(refId?: string): Promise<{
    id: string
    address: string
  }> {
    const client = await this.client()
    try {
      const res = await client.createWallets({
        blockchains: [this.blockchain()],
        count: 1,
        walletSetId: this.options.walletSetId,
        accountType: "SCA",
        ...(refId ? { metadata: [{ refId }] } : {}),
      })
      const wallet = res?.data?.wallets?.[0]
      if (!wallet?.address || !wallet?.id) {
        throw new Error("Circle createWallets returned no wallet")
      }
      return { id: wallet.id, address: wallet.address }
    } catch (e: any) {
      throw new CryptoUnavailableError(
        `Circle wallet provisioning failed: ${e?.message ?? e}`
      )
    }
  }

  private async treasuryWallet(): Promise<{ id: string; address: string }> {
    const cacheKey = `${this.network}:${this.env}`
    const cached = TREASURY_CACHE.get(cacheKey)
    if (cached) {
      return cached
    }

    const entry = await this.provisionWallet(`treasury-${cacheKey}`)
    TREASURY_CACHE.set(cacheKey, entry)
    return entry
  }

  async createDepositIntent(input: {
    reference: string
    usdc_amount: string
  }): Promise<DepositIntent> {
    // Fresh wallet per intent so each checkout has its own deposit address —
    // settlement checks are then scoped to this wallet and can never see
    // another intent's inbound transfer. (Testnet-PoC cost note: per-intent
    // wallets are free on testnet; on mainnet, batch/reap idle wallets.)
    const wallet = await this.provisionWallet(input.reference)
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

  async checkSettlement(query: SettlementQuery): Promise<SettlementStatus> {
    const { reference, wallet_id, expected_usdc } = query
    if (!wallet_id) {
      // Never guess another intent's wallet — without the intent's own
      // wallet_id the settlement simply stays pending.
      return { reference, status: "pending" }
    }

    const client = await this.client()
    try {
      const res = await client.listTransactions({
        walletIds: [wallet_id],
        blockchain: this.blockchain(),
      })
      const expected = expected_usdc ? Number(expected_usdc) : 0
      const inbound = (res?.data?.transactions ?? []).find((t: any) => {
        if (t?.transactionType !== "INBOUND" || t?.state !== "COMPLETE") {
          return false
        }
        const received = Number(t?.amounts?.[0] ?? 0)
        return !expected || received >= expected
      })
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

  async createWithdrawal(input: {
    reference: string
    address: string
    usdc_amount: string
  }): Promise<WithdrawalStatus> {
    const treasury = await this.treasuryWallet()
    const client = await this.client()
    try {
      // Find the treasury's USDC token id, then send to the seller address.
      const balances = await client.getWalletTokenBalance({ id: treasury.id })
      const usdc = (balances?.data?.tokenBalances ?? []).find((b: any) =>
        String(b?.token?.symbol ?? "").toUpperCase().startsWith("USDC")
      )
      if (!usdc?.token?.id) {
        throw new Error("treasury wallet holds no USDC token")
      }
      await client.createTransaction({
        walletId: treasury.id,
        tokenId: usdc.token.id,
        destinationAddress: input.address,
        amount: [input.usdc_amount],
        refId: input.reference,
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      })
      return { reference: input.reference, status: "pending" }
    } catch (e: any) {
      throw new CryptoUnavailableError(
        `Circle withdrawal failed: ${e?.message ?? e}`
      )
    }
  }

  async checkWithdrawal(reference: string): Promise<WithdrawalStatus> {
    const client = await this.client()
    try {
      const res = await client.listTransactions({ refId: reference })
      const tx = (res?.data?.transactions ?? [])[0]
      if (!tx) {
        return { reference, status: "pending" }
      }
      if (tx.state === "COMPLETE") {
        return { reference, status: "confirmed", tx_hash: tx.txHash }
      }
      if (["FAILED", "CANCELLED", "DENIED"].includes(String(tx.state))) {
        return { reference, status: "failed" }
      }
      return { reference, status: "pending" }
    } catch (e: any) {
      throw new CryptoUnavailableError(
        `Circle withdrawal check failed: ${e?.message ?? e}`
      )
    }
  }
}
