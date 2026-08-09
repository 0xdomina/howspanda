import { Metadata } from "next"

import ChatBox from "@modules/chat/components/chat-box"

export const metadata: Metadata = {
  title: "How's u Assistant",
  description:
    "Try the buyer chat assistant — a multi-provider AI that answers questions about shopping on How's u.",
}

export default async function DemoAiChatPage() {
  return (
    <div className="figma-container py-10 small:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <p className="eyebrow text-brand">Demo</p>
          <h1 className="mt-2 font-display text-3xl text-ink">
            Chat with the How&rsquo;s u Assistant
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Ask anything about shopping on the marketplace. Each message may be
            answered by a different AI provider, and your threads stay private
            to you &mdash; even when you aren&rsquo;t signed in.
          </p>
        </div>

        <ChatBox />
      </div>
    </div>
  )
}
