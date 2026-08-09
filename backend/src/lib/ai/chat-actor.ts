import { MedusaError } from "@medusajs/framework/utils"

// Chat ownership identity. Every chat conversation belongs to exactly one
// actor:
//   - signed-in customer/seller: actor_id from the authenticated JWT context
//     (never trusted from the body — a session cannot read another account's
//     thread)
//   - guest buyer: a high-entropy `client_key` the client generates and keeps
//     private (stored client-side / in a cookie). It is namespaced `guest:`
//     so it can never collide with a real actor id, and every read/write is
//     scoped by it — one guest can never read another guest's conversation
//     unless they know the key.
//
// The key must be unpredictable (min 12 chars, treated as a bearer secret).

export type ChatActor = {
  actorType: "customer" | "seller"
  actorId: string
}

const GUEST_PREFIX = "guest:"
const MIN_CLIENT_KEY_LENGTH = 12

function guestActorId(clientKey: string): string {
  return `${GUEST_PREFIX}${clientKey}`
}

export function isGuestActor(actorId: string): boolean {
  return actorId.startsWith(GUEST_PREFIX)
}

/**
 * Resolve the chat owner from the request. Prefers the authenticated actor;
 * falls back to the client_key carried in the body (`client_key`), a query
 * parameter (`client_key`), or the `x-client-key` header (so GET reads can be
 * scoped without putting the key in the URL).
 */
export function resolveChatActor(
  req: any,
  sources: { body?: Record<string, unknown>; query?: Record<string, unknown> } = {}
): ChatActor {
  const actorId = req?.auth_context?.actor_id as string | undefined
  if (actorId) {
    const actorType =
      req?.auth_context?.actor_type === "seller" ? "seller" : "customer"
    return { actorType, actorId }
  }

  const fromBody = (sources.body?.client_key as string | undefined)?.trim()
  const fromQuery = (sources.query?.client_key as string | undefined)?.trim()
  const fromHeader = (req?.headers?.["x-client-key"] as string | undefined)?.trim()
  const clientKey = fromBody || fromQuery || fromHeader

  if (!clientKey || clientKey.length < MIN_CLIENT_KEY_LENGTH) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Provide a signed-in session or a client_key (min 12 chars) so your chat " +
        "history stays private to you."
    )
  }

  return { actorType: "customer", actorId: guestActorId(clientKey) }
}
