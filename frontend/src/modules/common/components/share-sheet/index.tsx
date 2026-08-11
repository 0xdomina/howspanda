"use client"

import { clx } from "@medusajs/ui"
import { Dialog, Transition } from "@headlessui/react"
import React, { Fragment, useCallback, useMemo, useState } from "react"

import {
  SharePayload,
  ShareResult,
  ShareTarget,
  buildLinks,
  buildShareMessage,
  copyText,
  fireShareEvent,
  isWebShareSupported,
  openLink,
  shareViaNative,
} from "@lib/share"
import X from "@modules/common/icons/x"

type ShareSheetProps = {
  isOpen: boolean
  close: () => void
  payload: SharePayload
  entity: string
  entityId?: string
  onShared?: (result: ShareResult) => void
}

const BRAND_TARGETS: Array<{
  key: ShareTarget
  label: string
  color: string
}> = [
  { key: "whatsapp", label: "WhatsApp", color: "#25D366" },
  { key: "x", label: "X", color: "#0F1419" },
  { key: "facebook", label: "Facebook", color: "#1877F2" },
  { key: "telegram", label: "Telegram", color: "#28A8E9" },
  { key: "linkedin", label: "LinkedIn", color: "#0A66C2" },
  { key: "pinterest", label: "Pinterest", color: "#E60023" },
  { key: "sms", label: "SMS", color: "#34C759" },
  { key: "email", label: "Email", color: "#64748B" },
]

const BrandGlyph = ({ brand }: { brand: (typeof BRAND_TARGETS)[number] }) => {
  const common = {
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
  }

  switch (brand.key) {
    case "x":
      return (
        <svg {...common} fill="none">
          <path
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
            fill="currentColor"
          />
        </svg>
      )
    case "facebook":
      return (
        <svg {...common} fill="none">
          <path
            d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
            fill="currentColor"
          />
        </svg>
      )
    case "linkedin":
      return (
        <svg {...common} fill="none">
          <path
            d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"
            fill="currentColor"
          />
        </svg>
      )
    case "pinterest":
      return (
        <svg {...common} fill="none">
          <path
            d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.08 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"
            fill="currentColor"
          />
        </svg>
      )
    case "whatsapp":
      return (
        <svg {...common}>
          <path
            d="M12 2.6C7.05 2.6 3.02 6.53 3.02 11.3c0 1.66.52 3.2 1.4 4.47l-.92 3.44 3.56-.95a8.94 8.94 0 0 0 4.94 1.46c4.95 0 8.98-3.93 8.98-8.7S16.95 2.6 12 2.6z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M9.1 8.1c.15-.4.3-.4.5-.42h.4c.16 0 .33 0 .5.4l.5 1.2c.08.2.08.37-.08.55l-.42.5c-.16.18-.16.37 0 .62.3.5.8 1.25 1.6 1.68.27.14.5.11.67-.11l.4-.5c.18-.22.36-.22.56-.1l1.2.6c.42.2.42.4.42.52v.42c0 .22-.1.5-.3.62-.17.15-.55.5-1.4.48-.9 0-2.1-.33-3.4-1.5-1.25-1.12-1.85-2.5-1.97-3.2-.12-.7.45-1.1.62-1.3z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case "telegram":
      return (
        <svg {...common}>
          <path
            d="M22 2 11 13"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M22 2 15 22l-4-9-9-4 20-7z"
            fill="currentColor"
          />
        </svg>
      )
    case "sms":
      return (
        <svg {...common}>
          <path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 10.5h7M8.5 13.5h5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )
    case "email":
      return (
        <svg {...common}>
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="m3.5 7.5 8.5 5.5 8.5-5.5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    default:
      return null
  }
}

const ShareSheet = ({
  isOpen,
  close,
  payload,
  entity,
  entityId,
  onShared,
}: ShareSheetProps) => {
  const [copied, setCopied] = useState(false)

  const links = useMemo(() => buildLinks(payload), [payload])

  const handleNative = useCallback(async () => {
    const result = await shareViaNative(payload)
    if (result.status === "native") {
      fireShareEvent({ entity, entityId, channel: "native" })
      onShared?.(result)
      close()
    } else if (result.status === "cancelled") {
      // User dismissed the native sheet; keep the brand row open.
    }
  }, [payload, entity, entityId, onShared, close])

  const handleCopy = useCallback(async () => {
    const ok = await copyText(buildShareMessage(payload))
    if (ok) {
      setCopied(true)
      fireShareEvent({ entity, entityId, channel: "copy" })
      onShared?.({ status: "copy" })
      setTimeout(() => {
        setCopied(false)
        close()
      }, 900)
    }
  }, [payload, entity, entityId, onShared, close])

  const handleLink = useCallback(
    (key: ShareTarget) => {
      if (key === "copy") return
      const url = links[key]
      if (!url) return
      fireShareEvent({ entity, entityId, channel: key })
      onShared?.({ status: "link", channel: key })
      openLink(url)
      close()
    },
    [links, entity, entityId, onShared, close]
  )

  const previewTitle = payload.title ?? payload.text
  const previewSubtitle =
    payload.title && payload.text && payload.text !== payload.title
      ? payload.text
      : payload.description

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[80]" onClose={close}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px]" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-0 text-center sm:items-center sm:p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel
                className="glass-panel w-full max-w-md transform rounded-t-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-left align-middle shadow-modal sm:rounded-card"
                data-testid="share-sheet"
              >
                <div className="flex items-start justify-between">
                  <Dialog.Title className="text-lg font-semibold text-ink">
                    Share
                  </Dialog.Title>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close share"
                    className="rounded-control text-ink-muted transition-colors duration-fast hover:bg-paper-tinted hover:text-ink"
                  >
                    <X size={20} />
                  </button>
                </div>

                {(payload.image || previewTitle) && (
                  <div className="mt-5 flex items-center gap-3 rounded-control border border-ink-hairline bg-paper-surface/70 p-3">
                    {payload.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={payload.image}
                        alt={previewTitle}
                        className="h-14 w-14 shrink-0 rounded-control border border-ink-hairline object-cover"
                      />
                    ) : (
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-control bg-paper-tinted text-lg">
                        {previewTitle.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {previewTitle}
                      </p>
                      {previewSubtitle && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
                          {previewSubtitle}
                        </p>
                      )}
                      <p className="mt-1 truncate text-xs text-brand">
                        {payload.url}
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCopy}
                  className={clx(
                    "mt-4 flex w-full items-center justify-between rounded-control border px-4 py-3 text-left transition-colors duration-fast",
                    copied
                      ? "border-semantic-success/40 bg-semantic-success/5"
                      : "border-ink-hairline hover:bg-paper-tinted"
                  )}
                >
                  <span className="font-medium text-ink">
                    {copied ? "Link & message copied" : "Copy link & message"}
                  </span>
                  <span className="max-w-[60%] truncate text-sm text-ink-muted">
                    {payload.url}
                  </span>
                </button>

                {isWebShareSupported() && (
                  <button
                    type="button"
                    onClick={handleNative}
                    className="mt-3 w-full rounded-control bg-ink py-3 text-center text-sm font-medium text-paper-surface transition-transform duration-fast hover:bg-ink/90 active:scale-[0.98]"
                  >
                    More options
                  </button>
                )}

                <div className="mt-6 grid grid-cols-4 gap-3">
                  {BRAND_TARGETS.map((brand) => (
                    <button
                      key={brand.key}
                      type="button"
                      onClick={() => handleLink(brand.key)}
                      className="flex flex-col items-center gap-1.5 rounded-card py-2 transition-colors duration-fast hover:bg-paper-tinted"
                    >
                      <span
                        className="grid h-11 w-11 place-items-center rounded-full text-white shadow-sm transition-transform duration-fast group-hover:scale-105"
                        style={{ backgroundColor: brand.color }}
                        aria-hidden="true"
                      >
                        <BrandGlyph brand={brand} />
                      </span>
                      <span className="text-xs text-ink-muted">{brand.label}</span>
                    </button>
                  ))}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

export default ShareSheet