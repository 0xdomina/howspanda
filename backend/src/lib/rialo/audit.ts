// Rialo DevNet commerce audit trail.
//
// Append-only, best-effort event log on Rialo DevNet (NOT mainnet). Each event
// is anchored in a DevNet transaction built with @rialo/ts-cdk: a dust
// self-transfer plus a memo instruction carrying the event JSON. Reads scan
// the audit account's history and decode matching memos.
//
// Fail-closed by design: every public function catches its own errors and
// returns null/[] instead of throwing, so audit work can never break order
// or payment flows. Callers still wrap calls in try/catch as belt and braces.
//
// Env (all optional; writes stay off until provisioned):
//   RIALO_RPC_URL          DevNet RPC endpoint. Defaults to the CDK preset.
//   RIALO_AUDIT_ENABLED    "true" to write. Default false.
//   RIALO_AUDIT_KEY        Base58 secret key funding audit writes. Accepts the
//                          32-byte seed or the 64-byte secret (seed + pubkey);
//                          only the first 32 bytes are used as the seed.
//                          Fund via the DevNet faucet before enabling.
//   RIALO_AUDIT_ADDRESS    Audit account pubkey (base58). Needed for reads only
//                          when RIALO_AUDIT_KEY is unset; otherwise the key's
//                          own pubkey is used.
//   RIALO_AUDIT_TIMEOUT_MS Per-operation cap in ms. Default 15000.

import {
  createRialoClient,
  Keypair,
  PublicKey,
  RIALO_DEVNET_CHAIN,
  Signature,
  SYSTEM_PROGRAM_ID,
  TransactionBuilder,
  transferInstruction,
  URL_DEVNET,
  type Instruction,
  type RialoClient,
  type TransactionResponse,
} from "@rialo/ts-cdk"

export type CommerceEventKind = "order-paid"

export interface CommerceEventInput {
  kind: CommerceEventKind
  /** Stable business reference, e.g. the Medusa order id. */
  ref: string
  /** Who acted, e.g. buyer email. Null when unknown. Never a secret. */
  actor?: string | null
  /** Small JSON-serialisable detail bag. Never secrets. */
  payload?: Record<string, unknown>
}

export interface CommerceEventRecord {
  signature: string
  blockTime?: number
  kind: string
  ref: string
  actor?: string | null
  payload?: Record<string, unknown>
}

const MEMO_MARKER = "RIALO_AUDIT/1:"
const MAX_EVENT_BYTES = 800
const READ_LIMIT = 50
const FETCH_LIMIT = 25
const DUST_KELVIN = 1n

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

function base58Decode(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0)
  const raw: number[] = [0]
  for (const char of input) {
    const digit = BASE58_ALPHABET.indexOf(char)
    if (digit < 0) throw new Error("Invalid base58 character")
    let carry = digit
    for (let i = 0; i < raw.length; i++) {
      const value = raw[i] * 58 + carry
      raw[i] = value & 0xff
      carry = value >> 8
    }
    while (carry > 0) {
      raw.push(carry & 0xff)
      carry >>= 8
    }
  }
  let leadingZeros = 0
  for (const char of input) {
    if (char !== BASE58_ALPHABET[0]) break
    leadingZeros += 1
  }
  let end = raw.length - 1
  while (end > 0 && raw[end] === 0) end -= 1
  const body = raw.slice(0, end + 1).reverse()
  const significant = body.length === 1 && body[0] === 0 ? [] : body
  const result = new Uint8Array(leadingZeros + significant.length)
  result.set(significant, leadingZeros)
  return result
}

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return ""
  let leadingZeros = 0
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros += 1
  }
  if (leadingZeros === bytes.length) return BASE58_ALPHABET[0].repeat(bytes.length)
  const digits: number[] = [0]
  for (let i = leadingZeros; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < digits.length; j++) {
      const value = digits[j] * 256 + carry
      digits[j] = value % 58
      carry = Math.floor(value / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  let out = BASE58_ALPHABET[0].repeat(leadingZeros)
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]]
  return out
}

function auditEnabled(): boolean {
  const value = (process.env.RIALO_AUDIT_ENABLED ?? "false").trim().toLowerCase()
  return value === "true" || value === "1"
}

function rpcUrl(): string {
  return process.env.RIALO_RPC_URL || URL_DEVNET
}

function timeoutMs(): number {
  const raw = Number(process.env.RIALO_AUDIT_TIMEOUT_MS ?? "15000")
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15000
}

function createClient(): RialoClient {
  return createRialoClient({
    chain: { ...RIALO_DEVNET_CHAIN, rpcUrl: rpcUrl() },
    transport: { timeout: timeoutMs() },
  })
}

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
  })
  const raced = Promise.race([work, guard])
  return raced.finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/** True when writes are enabled and a usable key is present. Never throws. */
export function isRialoAuditConfigured(): boolean {
  try {
    if (!auditEnabled()) return false
    const keypair = loadAuditKeypair()
    if (!keypair) return false
    try {
      keypair.dispose()
    } catch {
      // Best-effort cleanup only.
    }
    return true
  } catch {
    return false
  }
}

function loadAuditKeypair(): Keypair | null {
  const raw = process.env.RIALO_AUDIT_KEY
  if (!raw) return null
  try {
    const bytes = base58Decode(raw.trim())
    const seed = bytes.length === 64 ? bytes.slice(0, 32) : bytes
    if (seed.length !== 32) return null
    return Keypair.fromSecretKey(seed)
  } catch {
    return null
  }
}

function resolveAuditAddress(keypair: Keypair | null): PublicKey | null {
  try {
    if (keypair) return keypair.publicKey
    const raw = process.env.RIALO_AUDIT_ADDRESS
    if (!raw) return null
    return PublicKey.fromString(raw.trim())
  } catch {
    return null
  }
}

function encodeEvent(input: CommerceEventInput): Uint8Array | null {
  try {
    const event = {
      v: 1,
      kind: input.kind,
      ref: input.ref,
      actor: input.actor ?? null,
      at: new Date().toISOString(),
      payload: input.payload ?? {},
    }
    let text = MEMO_MARKER + JSON.stringify(event)
    if (Buffer.byteLength(text, "utf8") > MAX_EVENT_BYTES) {
      text = MEMO_MARKER + JSON.stringify({ ...event, payload: { truncated: true } })
    }
    if (Buffer.byteLength(text, "utf8") > MAX_EVENT_BYTES) return null
    return new TextEncoder().encode(text)
  } catch {
    return null
  }
}

function decodeMatchingMemo(
  response: TransactionResponse,
  ref: string,
  signature: string,
  blockTime: bigint
): CommerceEventRecord | null {
  try {
    if (!response || response?.meta?.err) return null
    const instructions = response?.transaction?.message?.instructions ?? []
    for (const ix of instructions) {
      let text: string
      try {
        text = new TextDecoder().decode(base58Decode(ix.data))
      } catch {
        continue
      }
      if (!text.startsWith(MEMO_MARKER)) continue
      const event = JSON.parse(text.slice(MEMO_MARKER.length)) as {
        kind?: unknown
        ref?: unknown
        actor?: unknown
        payload?: unknown
      }
      if (event?.ref !== ref) continue
      return {
        signature,
        blockTime: Number(blockTime),
        kind: typeof event.kind === "string" ? event.kind : "unknown",
        ref,
        actor: typeof event.actor === "string" ? event.actor : null,
        payload:
          event.payload && typeof event.payload === "object"
            ? (event.payload as Record<string, unknown>)
            : {},
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Anchor a commerce event on Rialo DevNet. Best-effort: resolves to the
 * transaction signature, or null when disabled, unconfigured, oversized, or
 * on any DevNet/RPC failure. Never throws.
 */
export async function appendCommerceEvent(
  input: CommerceEventInput
): Promise<string | null> {
  if (!input || !input.kind || !input.ref) return null
  if (!auditEnabled()) return null
  const keypair = loadAuditKeypair()
  if (!keypair) return null
  try {
    const data = encodeEvent(input)
    if (!data) return null
    const client = createClient()
    const ms = timeoutMs()
    const configHashPrefix = await withTimeout(
      client.getConfigHashPrefix(),
      ms,
      "Rialo config hash"
    )
    const payer = keypair.publicKey
    const memo: Instruction = {
      programId: PublicKey.fromString(SYSTEM_PROGRAM_ID),
      accounts: [{ pubkey: payer, isSigner: true, isWritable: false }],
      data,
    }
    const signed = TransactionBuilder.create()
      .setPayer(payer)
      .setValidFrom(BigInt(Date.now()))
      .setConfigHashPrefix(configHashPrefix)
      .addInstruction(transferInstruction(payer, payer, DUST_KELVIN))
      .addInstruction(memo)
      .build()
      .sign(keypair)
    const sent = await withTimeout(
      client.sendTransaction(signed.serialize()),
      ms,
      "Rialo send"
    )
    // RialoClient.sendTransaction resolves to raw signature bytes.
    return base58Encode(Uint8Array.from(sent as unknown as ArrayLike<number>))
  } catch {
    return null
  } finally {
    try {
      keypair.dispose()
    } catch {
      // Best-effort cleanup only.
    }
  }
}

/**
 * Read back audit events for a business reference from Rialo DevNet.
 * Best-effort: resolves to matching records, or [] when unconfigured or on
 * any DevNet/RPC failure. Never throws.
 */
export async function readEvents(ref: string): Promise<CommerceEventRecord[]> {
  try {
    if (!ref) return []
    const keypair = loadAuditKeypair()
    try {
      const address = resolveAuditAddress(keypair)
      if (!address) return []
      const client = createClient()
      const ms = timeoutMs()
      const infos = await withTimeout(
        client.getSignaturesForAddress(address, { limit: READ_LIMIT }),
        ms,
        "Rialo history"
      )
      const out: CommerceEventRecord[] = []
      for (const info of (infos ?? []).slice(0, FETCH_LIMIT)) {
        if (!info || info.err) continue
        try {
          const response = await withTimeout(
            client.getTransaction(Signature.fromString(info.signature).toBytes()),
            ms,
            "Rialo fetch"
          )
          const record = decodeMatchingMemo(
            response,
            ref,
            info.signature,
            info.blockTime
          )
          if (record) out.push(record)
        } catch {
          continue
        }
      }
      return out
    } finally {
      try {
        keypair?.dispose()
      } catch {
        // Best-effort cleanup only.
      }
    }
  } catch {
    return []
  }
}
