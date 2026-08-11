import { Metadata } from "next"

import ChatBox from "@modules/chat/components/chat-box"

export const metadata: Metadata = {
  title: "How's u Assistant",
  description: "Shopping help from the How's u Assistant.",
}

export default function AiPage() {
  return (
    <div className="figma-container py-10 small:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <p className="eyebrow text-brand">Shopping help</p>
          <h1 className="mt-2 font-display text-3xl text-ink">
            How can we help?
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Find products and get help with delivery, payments, and returns.
          </p>
        </div>
        <ChatBox />
      </div>
    </div>
  )
}
