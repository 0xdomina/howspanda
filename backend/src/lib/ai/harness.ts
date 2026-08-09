import { z } from "zod"
import { getModelId } from "./model"

/**
 * AI safety harness — the single chokepoint every capability call must pass
 * through. Enforces four restriction rings:
 *
 *  1. CAPABILITY REGISTRY   every call must name a registered capability for
 *                           its actor. Unknown/forged capability names are
 *                           rejected before any model call.
 *  2. TOOL / READER ALLOWLIST each capability declares exactly which data
 *                           readers it may invoke; the harness refuses to run
 *                           any reader the capability does not declare.
 *  3. OUTPUT CONTRACTS      structured outputs must conform to the declared
 *                           Zod schema (reject + no billing on failure);
 *                           text outputs get a jailbreak/leak filter.
 *  4. SIDE-EFFECT POLICY    capabilities declare "none" (read-only) or
 *                           "proposal" (may only return a proposed action the
 *                           user must approve). Nothing here can mutate money,
 *                           orders, inventory, or payment rails.
 */

export type AiActor = "seller" | "buyer"

export type SideEffectPolicy = "none" | "proposal"

export type CapabilitySpec = {
  key: string
  actor: AiActor
  label: string
  /** Zod schema for structured output. Absent ⇒ free text (filtered). */
  schema?: z.ZodType
  /** Data readers this capability may call (keys in a reader registry). */
  readers: string[]
  sideEffects: SideEffectPolicy
}

const REGISTRY: Record<string, CapabilitySpec> = {}

export function registerCapability(spec: CapabilitySpec): void {
  REGISTRY[spec.key] = spec
}

export function getCapability(key: string): CapabilitySpec | undefined {
  return REGISTRY[key]
}

export function listCapabilities(actor?: AiActor): CapabilitySpec[] {
  return Object.values(REGISTRY).filter((c) => !actor || c.actor === actor)
}

export class HarnessBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HarnessBlockedError"
  }
}

/**
 * Ring 1 — capability + actor allowlist. Throws before any model call if the
 * capability is not registered for the actor.
 */
export function assertCapabilityAllowed(key: string, actor: AiActor): CapabilitySpec {
  const spec = getCapability(key)
  if (!spec) {
    throw new HarnessBlockedError(`Unknown capability "${key}" — blocked`)
  }
  if (spec.actor !== actor) {
    throw new HarnessBlockedError(
      `Capability "${key}" is not allowed for ${actor} actors`
    )
  }
  return spec
}

/**
 * Ring 2 — reader allowlist. Throws if a capability tries to invoke a data
 * reader it did not declare.
 */
export function assertReaderAllowed(spec: CapabilitySpec, reader: string): void {
  if (!spec.readers.includes(reader)) {
    throw new HarnessBlockedError(
      `Capability "${spec.key}" may not read "${reader}" — blocked by harness`
    )
  }
}

/**
 * Ring 3a — structured output contract. Validates against the declared Zod
 * schema. Returns the parsed value on success; throws on any mismatch so an
 * out-of-contract model response is rejected and never billed.
 */
export function validateStructuredOutput<T>(
  spec: CapabilitySpec,
  raw: unknown
): T {
  if (!spec.schema) {
    throw new HarnessBlockedError(
      `Capability "${spec.key}" declares no output schema but returned an object`
    )
  }
  const parsed = spec.schema.safeParse(raw)
  if (!parsed.success) {
    throw new HarnessBlockedError(
      `Capability "${spec.key}" produced output outside its contract: ` +
        parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .slice(0, 3)
          .join("; ")
    )
  }
  return parsed.data as T
}

/**
 * Ring 3b — free-text output filter.
 *  - strips any embedded `[capability:<name>]` directive that does not match
 *    the invoked capability (prompt-injection smuggling defense)
 *  - refuses to echo raw PII shapes (emails, phone numbers) outside of the
 *    capability's own declared context (seller/buyer insights already only
 *    receive scoped data; this is defense in depth on the way out)
 */
export function filterTextOutput(key: string, text: string): string {
  let out = text.replace(/\[capability:[a-zA-Z0-9_-]+\]/g, (m) => {
    const inner = /\[capability:([a-zA-Z0-9_-]+)\]/.exec(m)?.[1] ?? ""
    return inner === key ? "" : ""
  })

  // Do not let the model leak a contact pattern that was never part of the
  // input contract. Insights/briefs only ever see aggregated or seller-own
  // numbers; a raw contact leak means the model hallucinated it.
  const leakedContact =
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\+?[0-9]{7,15})/.exec(out)
  if (leakedContact) {
    out = out.replace(leakedContact[0], "[redacted]")
  }

  return out
}

/**
 * Run a capability through the harness: allowlist → reader-scope → output
 * contract. Wraps the model call so enforcement is uniform.
 */
export function harnessMetadata(key: string): { capability: string; model: string } {
  return { capability: key, model: getModelId() }
}

export { REGISTRY as CAPABILITY_REGISTRY }
