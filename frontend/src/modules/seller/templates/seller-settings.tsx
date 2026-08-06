"use client"

import { useState, useTransition } from "react"
import { updateSellerStore } from "@lib/data/seller"

type StoreInfo = {
  name?: string
  handle?: string
  logo?: string
  description?: string
}

const SellerSettingsClient = ({
  admin,
  store,
  isOwner,
}: {
  admin: { first_name?: string; last_name?: string }
  store: StoreInfo
  isOwner: boolean
}) => {
  const [storeName, setStoreName] = useState(store.name ?? "")
  const [handle, setHandle] = useState(store.handle ?? "")
  const [logo, setLogo] = useState(store.logo ?? "")
  const [description, setDescription] = useState(store.description ?? "")
  const [firstName, setFirstName] = useState(admin.first_name ?? "")
  const [lastName, setLastName] = useState(admin.last_name ?? "")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const submitStore = () => {
    setMessage(null)
    if (!storeName.trim()) {
      setMessage({ ok: false, text: "Store name is required." })
      return
    }
    startTransition(async () => {
      const res = await updateSellerStore({
        name: storeName.trim(),
        handle: handle.trim().toLowerCase() || undefined,
        logo: logo.trim() ? logo.trim() : null,
        description: description.trim() ? description.trim() : null,
      })
      if (res.success) {
        setMessage({ ok: true, text: "Store settings saved." })
      } else {
        setMessage({ ok: false, text: res.error ?? "Could not save store settings." })
      }
    })
  }

  const submitProfile = () => {
    setMessage(null)
    startTransition(async () => {
      const res = await updateSellerStore({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      })
      if (res.success) {
        setMessage({ ok: true, text: "Profile saved." })
      } else {
        setMessage({ ok: false, text: res.error ?? "Could not save profile." })
      }
    })
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Store settings
      </h2>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">Your store</h3>
        {!isOwner && (
          <p className="mt-1 text-xs text-ink-muted">
            Only the store owner can edit these.
          </p>
        )}
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Store name</label>
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              disabled={!isOwner}
              placeholder="e.g. Ada's Fabrics"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">
              Store handle (link slug)
            </label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              disabled={!isOwner}
              placeholder="adas-fabrics"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-ink-muted">
              Your public link is /stores/{handle || store.handle || "…"}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Logo URL</label>
            <input
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              disabled={!isOwner}
              placeholder="https://…/logo.png"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isOwner}
              rows={3}
              placeholder="What do you sell?"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink disabled:opacity-50"
            />
          </div>
          {isOwner && (
            <button
              type="button"
              disabled={isPending}
              onClick={submitStore}
              className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save store settings"}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">Your profile</h3>
        <div className="mt-3 grid grid-cols-1 small:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-muted">First name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Last name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={submitProfile}
          className="mt-3 rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save profile"}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

export default SellerSettingsClient
