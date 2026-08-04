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

const VALID_NETWORKS: string[] = ["base", "solana", "arc"]

export { isArcConfigured } from "../crypto/arc"

/**
 * Factory: env → user-wallet signer. Arc is the primary network — a direct L1
 * (USDC-native) configured via ARC_MNEMONIC / ARC_PRIVATE_KEY with no Circle
 * API key. Base/Solana fall back to mock unless a Circle key is present.
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

  // Base/Solana are secondary — mock unless a Circle key exists.
  const apiKey = process.env.CIRCLE_API_KEY
  if (apiKey && apiKey !== "mock") {
    // TODO: circle-backed per-user wallet signer (MPC/managed) — same seam.
    throw new WalletUnavailableError(
      "Circle-backed user wallets are not wired yet; use the Arc network or mock."
    )
  }
  return new MockUserWalletSigner(chosen, env)
}

export function isWalletEnabled(): boolean {
  return isCryptoEnabled()
}
