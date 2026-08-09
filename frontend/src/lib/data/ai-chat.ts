"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"

// Buyer chat data helpers. Ownership is resolved server-side: a signed-in
// customer is identified by their JWT actor; guests pass a private client_key
// they generate and keep client-side (never sent in a URL when avoidable).
// The backend never trusts the client_key to be an account id — it is
// namespaced `guest:` so it can never collide with a real actor.

export type AiChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
  provider?: string | null
  model_id?: string | null
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
  provider: string
  model_id: string
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
    const headers = await getAuthHeaders()
    const res = await sdk.client.fetch<AiChatReply>("/store/ai/chat", {
      method: "POST",
      headers,
      body: {
        message: input.message,
        client_key: input.clientKey,
        conversation_id: input.conversationId,
        title: input.title,
      },
    })
    return { ...res, success: true, error: null }
  } catch (error: any) {
    return {
      success: false,
      ok: false,
      code: error?.response?.data?.code,
      error:
        error?.response?.data?.message ??
        error?.message ??
        error?.toString?.() ??
        String(error),
    }
  }
}

// The full history of one conversation (owner-scoped; 404 for other owners).
export const getAiChatHistory = async (input: {
  conversationId: string
  clientKey?: string
}): Promise<{ conversation: { id: string; title: string | null }; messages: AiChatMessage[] } | null> => {
  try {
    const headers = await getAuthHeaders()
    const res = await sdk.client.fetch<{
      ok: boolean
      conversation: { id: string; title: string | null }
      messages: AiChatMessage[]
    }>("/store/ai/chat", {
      method: "GET",
      headers,
      query: {
        conversation_id: input.conversationId,
        client_key: input.clientKey,
      },
      cache: "no-store",
    })
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
    const headers = await getAuthHeaders()
    return await sdk.client
      .fetch<{ conversations: AiChatConversation[] }>(
        "/store/ai/chat/conversations",
        {
          method: "GET",
          headers,
          query: { client_key: input.clientKey },
          cache: "no-store",
        }
      )
      .then(({ conversations }) => conversations ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}
