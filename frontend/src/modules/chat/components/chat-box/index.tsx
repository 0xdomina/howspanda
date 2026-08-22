"use client"

import { useEffect, useRef, useState, useTransition } from "react"

import {
  getAiChatHistory,
  listAiChatConversations,
  sendAiChatMessage,
  type AiChatMessage,
  type AiChatQuota,
} from "@lib/data/ai-chat"

// Buyer chat box. Guests get a private client_key generated in the browser
// and kept in localStorage — the backend namespaces it `guest:` so one guest
// can never read another's thread. A signed-in customer is identified by their
// JWT instead (the client_key is simply ignored server-side).

const CLIENT_KEY_STORAGE = "howsu_ai_chat_client_key"

const safeAssistantCopy = (message: AiChatMessage): AiChatMessage => {
  if (message.role !== "assistant") return message

  // Older conversations may contain a fallback phrase from before the
  // production copy cleanup. Keep that legacy text from resurfacing.
  if (/^Mock reply:/i.test(message.content)) {
    return {
      ...message,
      content: "Here’s a helpful answer based on How’s U shopping guidance.",
    }
  }

  return message
}

const getStoredKey = (): string => {
  if (typeof window === "undefined") return ""
  const existing = window.localStorage.getItem(CLIENT_KEY_STORAGE)
  if (existing && existing.length >= 12) return existing
  const fresh = crypto.randomUUID().replace(/-/g, "").slice(0, 24)
  window.localStorage.setItem(CLIENT_KEY_STORAGE, fresh)
  return fresh
}

const ChatMessage = ({ message }: { message: AiChatMessage }) => {
  const safeMessage = safeAssistantCopy(message)
  const isUser = safeMessage.role === "user"
  const isSystem = safeMessage.role === "system"

  if (isSystem) return null

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-control px-4 py-2.5 text-sm leading-relaxed shadow-float ${
          isUser
            ? "bg-ink text-paper"
            : "bg-paper-surface border border-ink-hairline text-ink"
        }`}
      >
        <p className="whitespace-pre-wrap">{safeMessage.content}</p>
      </div>
    </div>
  )
}

export default function ChatBox() {
  const [clientKey] = useState<string>(() => getStoredKey())
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [quota, setQuota] = useState<AiChatQuota | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Restore the owner's most recent conversation, if any.
    listAiChatConversations({ clientKey }).then(async (conversations) => {
      if (conversations.length) {
        const latest = conversations[0]
        const history = await getAiChatHistory({
          conversationId: latest.id,
          clientKey,
        })
        if (history) {
          setConversationId(latest.id)
          setMessages(
            history.messages.filter((m) => m.role !== "system")
          )
        }
      }
    })
  }, [clientKey])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, isPending])

  const send = () => {
    const trimmed = input.trim()
    if (!trimmed || isPending) return

    setError(null)
    setInput("")

    const userMessage: AiChatMessage = {
      role: "user",
      content: trimmed,
    }
    setMessages((prev) => [...prev, userMessage])

    startTransition(async () => {
      const res = await sendAiChatMessage({
        message: trimmed,
        clientKey,
        conversationId: conversationId ?? undefined,
      })

      if (!res.success || !res.ok) {
        setError(res.error ?? "Something went wrong.")
        if (res.code === "quota_exhausted") {
          setQuota({ used: 0, limit: 0, remaining: 0 })
        }
        return
      }

      setConversationId(res.conversation_id ?? null)
      if (res.quota) setQuota(res.quota)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.reply ?? "",
        },
      ])
    })
  }

  return (
    <div className="flex h-[520px] flex-col overflow-hidden rounded-control border border-ink-hairline bg-white shadow-float">
      <div className="soft-glass flex items-center justify-between border-b border-ink-hairline px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-ink">How&rsquo;s u Assistant</p>
          <p className="text-xs text-ink-muted">
            Ask about shopping, products, or using the marketplace
          </p>
        </div>
        {quota ? (
          <span className="rounded-full bg-paper-tinted px-3 py-1 text-xs text-ink-muted">
            {quota.remaining > 0
              ? `${quota.remaining} chats left today`
              : "Today’s chat limit has been reached"}
          </span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 no-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="my-auto text-center text-sm text-ink-muted">
            <p className="text-lg text-ink">Hi, I&rsquo;m here to help you shop.</p>
            <p className="mt-1">
              Try &ldquo;How do returns work?&rdquo; or &ldquo;How do I pay?&rdquo;
            </p>
          </div>
        ) : (
          messages.map((m, i) => <ChatMessage key={i} message={m} />)
        )}
        {isPending ? (
          <div className="flex justify-start">
            <span className="rounded-control border border-ink-hairline bg-paper-surface px-4 py-2.5 text-sm text-ink-muted">
              Thinking…
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="border-t border-rose-200 bg-rose-50 px-5 py-2 text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      <form
        className="flex items-center gap-2 border-t border-ink-hairline bg-paper-surface p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about shopping on How's u…"
          className="w-full rounded-control border border-ink-hairline bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="rounded-control bg-brand px-4 py-2.5 text-sm font-semibold text-brand-inverse transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}
