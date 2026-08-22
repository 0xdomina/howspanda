// Buyer chat data helpers. Ownership is resolved server-side: a signed-in
// customer is identified by their JWT actor; guests pass a private client_key
// they generate and keep client-side (never sent in a URL when avoidable).
// The backend never trusts the client_key to be an account id — it is
// namespaced `guest:` so it can never collide with a real actor.

export type AiChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
  created_at?: string
}

export type AiChatConversation = {
  id: string
  title: string | null
  updated_at?: string
}

export type AiChatQuota = {
  used: number
  limit: number
  remaining: number
}

export type AiChatReply = {
  ok: boolean
  conversation_id: string
  reply: string
  quota?: AiChatQuota
  message?: string
  code?: string
}

export type AiChatResult<T> = {
  success: boolean
  error: string | null
  code?: string
} & T

// Send one chat turn. Returns the assistant reply plus the owner-scoped
// conversation id so the client can continue the same thread.
export const sendAiChatMessage = async (input: {
  message: string
  clientKey?: string
  conversationId?: string
  title?: string
}): Promise<AiChatResult<Partial<AiChatReply>>> => {
  try {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: input.message,
        client_key: input.clientKey,
        conversation_id: input.conversationId,
        title: input.title,
      }),
    })
    const res = (await response.json().catch(() => ({}))) as AiChatReply
    if (!response.ok) {
      return {
        ...res,
        success: false,
        ok: false,
        code: res.code,
        error: res.message ?? "The assistant is unavailable right now. Please try again shortly.",
      }
    }
    return { ...res, success: true, error: null }
  } catch (error: any) {
    return {
      success: false,
      ok: false,
      code: undefined,
      error: error?.message ?? "The assistant is unavailable right now. Please try again shortly.",
    }
  }
}

// The full history of one conversation (owner-scoped; 404 for other owners).
export const getAiChatHistory = async (input: {
  conversationId: string
  clientKey?: string
}): Promise<{ conversation: { id: string; title: string | null }; messages: AiChatMessage[] } | null> => {
  try {
    const params = new URLSearchParams({ conversation_id: input.conversationId })
    if (input.clientKey) params.set("client_key", input.clientKey)
    const response = await fetch(`/api/ai/chat?${params.toString()}`, {
      cache: "no-store",
    })
    if (!response.ok) return null
    const res = (await response.json()) as {
      ok: boolean
      conversation: { id: string; title: string | null }
      messages: AiChatMessage[]
    }
    return { conversation: res.conversation, messages: res.messages ?? [] }
  } catch {
    return null
  }
}

// The owner's conversation list, newest first.
export const listAiChatConversations = async (input: {
  clientKey?: string
}): Promise<AiChatConversation[]> => {
  try {
    const params = new URLSearchParams()
    if (input.clientKey) params.set("client_key", input.clientKey)
    const response = await fetch(`/api/ai/chat?${params.toString()}`, {
      cache: "no-store",
    })
    if (!response.ok) return []
    const { conversations } = (await response.json()) as {
      conversations?: AiChatConversation[]
    }
    return conversations ?? []
  } catch {
    return []
  }
}
