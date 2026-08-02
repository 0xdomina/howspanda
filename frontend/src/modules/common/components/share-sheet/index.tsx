"use client"

import { clx } from "@medusajs/ui"
import { Dialog, Transition } from "@headlessui/react"
import React, { Fragment, useCallback, useMemo, useState } from "react"

import {
  SharePayload,
  ShareResult,
  ShareTarget,
  buildLinks,
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
}> = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "x", label: "X" },
  { key: "facebook", label: "Facebook" },
  { key: "telegram", label: "Telegram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
  { key: "pinterest", label: "Pinterest" },
]

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
    const ok = await copyText(payload.url)
    if (ok) {
      setCopied(true)
      fireShareEvent({ entity, entityId, channel: "copy" })
      onShared?.({ status: "copy" })
      setTimeout(() => {
        setCopied(false)
        close()
      }, 900)
    }
  }, [payload.url, entity, entityId, onShared, close])

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
                className="w-full max-w-md transform rounded-t-card bg-paper-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-left align-middle shadow-modal sm:rounded-card"
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

                <button
                  type="button"
                  onClick={handleCopy}
                  className={clx(
                    "mt-5 flex w-full items-center justify-between rounded-control border px-4 py-3 text-left transition-colors duration-fast",
                    copied
                      ? "border-semantic-success/40 bg-semantic-success/5"
                      : "border-ink-hairline hover:bg-paper-tinted"
                  )}
                >
                  <span className="font-medium text-ink">
                    {copied ? "Link copied" : "Copy link"}
                  </span>
                  <span className="text-sm text-ink-muted">{payload.url}</span>
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
                  {BRAND_TARGETS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleLink(key)}
                      className="flex flex-col items-center gap-1.5 rounded-card py-2 transition-colors duration-fast hover:bg-paper-tinted"
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-hairline text-xs font-semibold uppercase tracking-wide text-ink"
                        aria-hidden="true"
                      >
                        {label.slice(0, 2)}
                      </span>
                      <span className="text-xs text-ink-muted">{label}</span>
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
