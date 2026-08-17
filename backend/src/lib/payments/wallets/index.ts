import {
  getNetworkEnv,
  isCryptoEnabled,
  isMockSignerForced,
} from "../crypto"
import {
  UserWalletSigner,
  WalletUnavailableError,
} from "./adapter"
import type { CryptoNetwork } from "../crypto/adapter"
import { isArcConfigured } from "../crypto/arc"
import { MockUserWalletSigner } from "./mock"
import { ArcUserWalletSigner } from "./arc"
import { CircleUserWalletSigner } from "./circle"

const VALID_NETWORKS: string[] = ["base", "solana", "arc"]

export { isArcConfigured } from "../crypto/arc"

/**
 * Factory: env → user-wallet signer. The configured crypto default selects the
 * network; Arc uses the direct signer while Base/Solana use Circle when live
 * credentials are present and otherwise remain in explicit mock mode.
 */
export function getUserWalletSigner(network?: string): UserWalletSigner {
  const chosen = (network ||
    process.env.CRYPTO_DEFAULT_NETWORK ||
    "arc") as CryptoNetwork

  if (!VALID_NETWORKS.includes(chosen)) {
    throw new WalletUnavailableError(`Unknown wallet network "${chosen}"`)
  }

  const env = getNetworkEnv()

  if (isMockSignerForced()) {
    return new MockUserWalletSigner(chosen, env)
  }

  if (chosen === "arc") {
    if (isArcConfigured()) {
      return new ArcUserWalletSigner()
    }
    return new MockUserWalletSigner(chosen, env)
  }

  // Base/Solana run on Circle programmable (developer-controlled) wallets
  // when a real key is configured; otherwise they stay on the mock signer.
  const apiKey = process.env.CIRCLE_API_KEY
  if (apiKey && apiKey !== "mock") {
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET
    const walletSetId = process.env.CIRCLE_WALLET_SET_ID
    if (!entitySecret || !walletSetId) {
      throw new WalletUnavailableError(
        "Circle is enabled with a real API key but CIRCLE_ENTITY_SECRET or CIRCLE_WALLET_SET_ID is missing"
      )
    }
    if (!/^[a-fA-F0-9]{64}$/.test(entitySecret)) {
      throw new WalletUnavailableError(
        "CIRCLE_ENTITY_SECRET must be the registered 32-byte hexadecimal entity secret"
      )
    }
    return new CircleUserWalletSigner(chosen, env, {
      apiKey,
      entitySecret,
      walletSetId,
      accountType: process.env.CIRCLE_ACCOUNT_TYPE === "EOA" ? "EOA" : "SCA",
      baseUrl: process.env.CIRCLE_API_BASE_URL,
    })
  }
  return new MockUserWalletSigner(chosen, env)
}

export function isWalletEnabled(): boolean {
  return isCryptoEnabled()
}
