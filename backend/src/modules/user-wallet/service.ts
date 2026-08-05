import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import UserWallet from "./models/user-wallet"
import WalletSpend from "./models/wallet-spend"
import { getUserWalletSigner } from "../../lib/payments/wallets"
import type {
  UserWallet as UserWalletView,
  UserWalletSigner,
} from "../../lib/payments/wallets/adapter"
import type { CryptoNetwork, NetworkEnv } from "../../lib/payments/crypto/adapter"

type WalletActor = {
  actor_type: string
  actor_id: string
  wallet_key: string
  network?: string
}

export type WalletInfo = {
  network: string
  env: string
  address: string
  balance_usdc: string
}

type WalletSpendView = {
  id: string
  idempotency_key: string
  to_address: string
  usdc_amount: string
  reference: string
  status: string
  tx_hash: string | null
  created_at?: Date
  updated_at?: Date
}

class UserWalletModuleService extends MedusaService({ UserWallet, WalletSpend }) {
  /**
   * Ensure the actor has a wallet row (deriving the address from a uniquely
   * allocated derivation index) and return the stored row + its live balance.
   */
  async getOrCreateWallet(input: WalletActor): Promise<{
    wallet: UserWalletView
    balance_usdc: string
  }> {
    const network = input.network || "arc"
    const signer = getUserWalletSigner(network)

    let [wallet] = await this.listUserWallets({
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      network,
    })
    if (!wallet) {
      // Derivation indices come from an atomic DB counter — unique by
      // construction, so two actors can never be derived onto the same key.
      const derivationIndex = await this.nextDerivationIndex()
      const derived = await signer.deriveWallet(derivationIndex)
      wallet = await this.createUserWallets({
        actor_type: input.actor_type,
        actor_id: input.actor_id,
        wallet_key: input.wallet_key,
        network: derived.network as string,
        env: derived.env as string,
        address: derived.address,
        derivation_index: derived.derivation_index,
      })
    }

    const balance_usdc = await this.readBalanceSafe(signer, wallet.address)
    return {
      wallet: {
        network: wallet.network as CryptoNetwork,
        env: wallet.env as NetworkEnv,
        address: wallet.address,
        derivation_index: wallet.derivation_index,
      },
      balance_usdc,
    }
  }

  /**
   * Atomically allocate the next unique derivation index from a Postgres
   * sequence. `nextval` is concurrency-safe: parallel wallet creations never
   * observe the same value, so no two actors share a derived key.
   */
  private async nextDerivationIndex(): Promise<number> {
    const manager = (this as any).baseRepository_.getActiveManager() as {
      execute: (sql: string) => Promise<Array<{ idx: string | number }>>
    }
    const [row] = await manager.execute(
      `SELECT nextval('wallet_derivation_index_seq') AS idx`
    )
    return Number(row?.idx ?? 0)
  }

  /**
   * Read-only wallet + balance for an existing actor (no row created). Returns
   * null when the actor has no wallet yet.
   */
  async getWalletInfo(input: {
    actor_type: string
    actor_id: string
    network?: string
  }): Promise<WalletInfo | null> {
    const network = input.network || "arc"
    const [wallet] = await this.listUserWallets({
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      network,
    })
    if (!wallet) {
      return null
    }
    const signer = getUserWalletSigner(wallet.network)
    const balance_usdc = await this.readBalanceSafe(signer, wallet.address)
    return {
      network: wallet.network,
      env: wallet.env,
      address: wallet.address,
      balance_usdc,
    }
  }

  /**
   * Balance reads must never block wallet provisioning or display. If the
   * chain RPC is unreachable, report "0" rather than failing the whole flow.
   */
  private async readBalanceSafe(
    signer: UserWalletSigner,
    address: string
  ): Promise<string> {
    try {
      return await signer.balanceOf(address)
    } catch (err) {
      console.warn(
        `[user-wallet] balanceOf failed for ${address} (${signer.network}): ${
          (err as Error).message
        }`
      )
      return "0"
    }
  }

  /**
   * Idempotent spend intent: one row per (idempotency_key, wallet). Replayed
   * keys return the existing intent instead of double-spending. The intent is
   * recorded BEFORE any signing — the private key never touches the DB.
   */
  async createSpendIntent(input: {
    actor_type: string
    actor_id: string
    idempotency_key: string
    to_address: string
    usdc_amount: string
    reference: string
    network?: string
  }): Promise<{
    spend: WalletSpendView
    address: string
    to_address: string
  }> {
    const network = input.network || "arc"
    const [wallet] = await this.listUserWallets({
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      network,
    })
    if (!wallet) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "No wallet for this actor yet"
      )
    }

    const [existing] = await this.listWalletSpends(
      { idempotency_key: input.idempotency_key, wallet_id: wallet.id },
      { take: 1 }
    )
    if (existing) {
      return { spend: existing, address: wallet.address, to_address: wallet.address }
    }

    const spend = await this.createWalletSpends({
      idempotency_key: input.idempotency_key,
      to_address: input.to_address,
      usdc_amount: input.usdc_amount,
      reference: input.reference,
      status: "pending",
      wallet_id: wallet.id,
    })

    return { spend, address: wallet.address, to_address: input.to_address }
  }

  /**
   * Sign + broadcast a previously recorded spend intent. Re-derives the key
   * from the wallet's stored derivation index and moves USDC from the user
   * wallet to the intent's destination (a server-derived session deposit
   * address for payments, or a password-confirmed external address for
   * withdrawals). Idempotent on the stored intent row.
   */
  async signSpend(input: {
    actor_type: string
    actor_id: string
    idempotency_key: string
    network?: string
  }): Promise<WalletSpendView> {
    const network = input.network || "arc"
    const [wallet] = await this.listUserWallets({
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      network,
    })
    if (!wallet) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "No wallet for this actor yet"
      )
    }
    const [spend] = await this.listWalletSpends(
      { idempotency_key: input.idempotency_key, wallet_id: wallet.id },
      { take: 1 }
    )
    if (!spend) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "No spend intent for this idempotency key"
      )
    }
    if (spend.status === "signed" || spend.status === "confirmed") {
      // Already processed — replay is a no-op.
      return spend
    }
    if (spend.status === "failed") {
      return spend
    }

    const signer = getUserWalletSigner(wallet.network)
    const result = await signer.spend({
      derivationIndex: wallet.derivation_index,
      to: spend.to_address,
      usdc_amount: spend.usdc_amount,
      reference: spend.reference,
    })

    if (result.status === "failed") {
      await this.updateWalletSpends({ id: spend.id, status: "failed" })
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Wallet balance too low for this spend"
      )
    }

    // Record "signed" the moment the transfer is broadcast so any replay of
    // this idempotency key short-circuits above — re-signing a pending row
    // would double-broadcast (double payment). The signer's own
    // pending/confirmed state is reconciled later via checkSpend.
    await this.updateWalletSpends({
      id: spend.id,
      status: "signed",
      tx_hash: result.tx_hash ?? null,
    })
    return { ...spend, status: "signed", tx_hash: result.tx_hash ?? null }
  }

  async checkSpend(input: {
    actor_type: string
    actor_id: string
    idempotency_key: string
    network?: string
  }): Promise<WalletSpendView> {
    const network = input.network || "arc"
    const [wallet] = await this.listUserWallets({
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      network,
    })
    if (!wallet) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "No wallet for this actor yet"
      )
    }
    const [spend] = await this.listWalletSpends(
      { idempotency_key: input.idempotency_key, wallet_id: wallet.id },
      { take: 1 }
    )
    if (!spend) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "No spend intent for this idempotency key"
      )
    }
    // A signed (broadcast) spend is in flight — reconcile only when the chain
    // reports a terminal state. Never regress a signed row back to pending, or
    // a replay would re-broadcast.
    if (spend.status === "signed") {
      const signer = getUserWalletSigner(wallet.network)
      const result = await signer.checkSpend({
        reference: spend.reference,
        tx_hash: spend.tx_hash,
      })
      if (result.status === "confirmed" || result.status === "failed") {
        await this.updateWalletSpends({
          id: spend.id,
          status: result.status,
          tx_hash: result.tx_hash ?? null,
        })
        return { ...spend, status: result.status, tx_hash: result.tx_hash ?? null }
      }
    }
    return spend
  }

  /**
   * Reconcile ONE signed spend against the chain (driven by the
   * reconcile-wallet-spends scheduled job). Terminal verdicts are applied
   * idempotently; anything still in flight is left signed for the next sweep.
   * Never regresses a row.
   */
  async reconcileSpend(input: { id: string }): Promise<WalletSpendView> {
    const [spend] = await this.listWalletSpends({ id: input.id }, { take: 1 })
    if (!spend) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "No spend intent for this id"
      )
    }
    if (spend.status !== "signed") {
      return spend
    }
    const [wallet] = await this.listUserWallets(
      { id: spend.wallet_id },
      { take: 1 }
    )
    if (!wallet) {
      return spend
    }
    const signer = getUserWalletSigner(wallet.network)
    const result = await signer.checkSpend({
      reference: spend.reference,
      tx_hash: spend.tx_hash,
    })
    if (result.status === "confirmed" || result.status === "failed") {
      await this.updateWalletSpends({
        id: spend.id,
        status: result.status,
        tx_hash: result.tx_hash ?? null,
      })
      return { ...spend, status: result.status, tx_hash: result.tx_hash ?? null }
    }
    return spend
  }
}

export default UserWalletModuleService
