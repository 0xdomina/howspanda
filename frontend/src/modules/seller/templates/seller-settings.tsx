"use client"

import { ChangeEvent, useState, useTransition } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { encodeProductImage } from "@lib/media/image"
import { uploadSellerMedia } from "@lib/data/seller-media"
import { updateSellerStore } from "@lib/data/seller"

type ThemeName = "sunset" | "midnight" | "mint" | "candy" | "cobalt"

type StoreInfo = {
  name?: string
  handle?: string
  logo?: string
  cover_image?: string
  description?: string
  accent_color?: string
  theme?: ThemeName
  crypto_payments_enabled?: boolean
}

const themes: { id: ThemeName; label: string; gradient: string; color: string }[] = [
  { id: "sunset", label: "Sunset", gradient: "linear-gradient(135deg,#ef4444,#f59e0b)", color: "#ef4444" },
  { id: "midnight", label: "Midnight", gradient: "linear-gradient(135deg,#111827,#4338ca)", color: "#4338ca" },
  { id: "mint", label: "Mint", gradient: "linear-gradient(135deg,#047857,#a7f3d0)", color: "#047857" },
  { id: "candy", label: "Candy", gradient: "linear-gradient(135deg,#db2777,#c084fc)", color: "#db2777" },
  { id: "cobalt", label: "Cobalt", gradient: "linear-gradient(135deg,#2563eb,#22d3ee)", color: "#2563eb" },
]

const SellerSettingsClient = ({
  store,
  isOwner,
}: {
  store: StoreInfo
  isOwner: boolean
}) => {
  const [storeName, setStoreName] = useState(store.name ?? "")
  const [handle, setHandle] = useState(store.handle ?? "")
  const [logo, setLogo] = useState(store.logo ?? "")
  const [coverImage, setCoverImage] = useState(store.cover_image ?? "")
  const [description, setDescription] = useState(store.description ?? "")
  const [accentColor, setAccentColor] = useState(store.accent_color ?? "#ef4444")
  const [theme, setTheme] = useState<ThemeName>(store.theme ?? "sunset")
  const [cryptoEnabled, setCryptoEnabled] = useState(store.crypto_payments_enabled ?? true)
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>, target: "logo" | "cover") => {
    const file = event.target.files?.[0]
    if (!file) return
    setMessage(null)
    setUploading(target)
    try {
      const blob = await encodeProductImage(file)
      const result = await uploadSellerMedia(
        new File([blob], `${target}-${Date.now()}.webp`, { type: blob.type }),
        "image"
      )
      if (result.url) {
        if (target === "logo") setLogo(result.url)
        else setCoverImage(result.url)
      } else {
        setMessage({ ok: false, text: result.error ?? "Could not upload that image." })
      }
    } catch (error: any) {
      setMessage({ ok: false, text: error?.message ?? "Could not process that image." })
    } finally {
      setUploading(null)
      event.target.value = ""
    }
  }

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
        cover_image: coverImage.trim() ? coverImage.trim() : null,
        description: description.trim() ? description.trim() : null,
        accent_color: accentColor,
        theme,
      })
      setMessage(res.success
        ? { ok: true, text: "Your storefront is updated." }
        : { ok: false, text: res.error ?? "Could not save store settings." })
    })
  }

  const submitPayments = () => {
    setMessage(null)
    if (!isOwner) {
      setMessage({ ok: false, text: "Only the store owner can change this." })
      return
    }
    startTransition(async () => {
      const res = await updateSellerStore({ crypto_payments_enabled: cryptoEnabled })
      setMessage(res.success ? { ok: true, text: "Payment settings saved." } : { ok: false, text: res.error ?? "Could not save payment settings." })
    })
  }

  const publicHandle = handle.trim().toLowerCase() || store.handle || "your-store"
  const selectedTheme = themes.find((item) => item.id === theme) ?? themes[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 small:flex-row small:items-end small:justify-between">
        <div>
          <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">Store settings</h2>
          <p className="mt-1 text-sm text-ink-muted">Make your store feel like you, then share it anywhere.</p>
        </div>
        <LocalizedClientLink
          href={`/store/${publicHandle}`}
          target="_blank"
          className="figma-button inline-flex items-center justify-center rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white"
        >
          View live store ↗
        </LocalizedClientLink>
      </div>

      <div className="grid gap-6 large:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="space-y-6">
          <div className="glass-panel rounded-large p-5 small:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-medium text-ink">Your storefront</h3>
                <p className="mt-1 text-sm text-ink-muted">This is the public profile buyers will see.</p>
              </div>
              {!isOwner && <span className="text-xs text-ink-muted">Owner only</span>}
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-ink-muted">Store name</label>
                <input value={storeName} onChange={(e) => setStoreName(e.target.value)} disabled={!isOwner} placeholder="e.g. Ada's Fabrics" className="w-full rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-ink disabled:opacity-50" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-muted">Your store link</label>
                <div className="flex items-center gap-2">
                  <input value={handle} onChange={(e) => setHandle(e.target.value)} disabled={!isOwner} placeholder="adas-fabrics" className="min-w-0 flex-1 rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-ink disabled:opacity-50" />
                  <LocalizedClientLink href={`/store/${publicHandle}`} target="_blank" className="shrink-0 rounded-medium border border-ink-hairline px-3 py-2 text-sm font-medium text-ink hover:bg-white">Open</LocalizedClientLink>
                </div>
                <p className="mt-1 text-xs text-ink-muted">Your public link: /store/{publicHandle}</p>
              </div>
              <div className="grid gap-3 small:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-ink-muted">Profile image</label>
                  <label className="flex cursor-pointer items-center justify-center rounded-medium border border-dashed border-ink-hairline bg-white/50 px-3 py-3 text-center text-sm text-ink hover:bg-white">
                    {uploading === "logo" ? "Preparing image…" : logo ? "Change profile image" : "Upload profile image"}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={!isOwner || uploading !== null} onChange={(event) => uploadImage(event, "logo")} />
                  </label>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink-muted">Store cover image</label>
                  <label className="flex cursor-pointer items-center justify-center rounded-medium border border-dashed border-ink-hairline bg-white/50 px-3 py-3 text-center text-sm text-ink hover:bg-white">
                    {uploading === "cover" ? "Preparing image…" : coverImage ? "Change cover image" : "Upload cover image"}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={!isOwner || uploading !== null} onChange={(event) => uploadImage(event, "cover")} />
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-muted">Short intro</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isOwner} rows={3} maxLength={1000} placeholder="Tell people what makes your store special." className="w-full rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-ink disabled:opacity-50" />
              </div>
              {isOwner && <button type="button" disabled={isPending || uploading !== null} onClick={submitStore} className="figma-button rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isPending ? "Saving…" : "Save storefront"}</button>}
            </div>
          </div>

          <div className="glass-panel rounded-large p-5 small:p-6">
            <h3 className="font-display text-lg font-medium text-ink">Look and feel</h3>
            <p className="mt-1 text-sm text-ink-muted">Choose a mood and the highlight colour used across your public store.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 small:grid-cols-5">
              {themes.map((item) => (
                <button key={item.id} type="button" disabled={!isOwner} onClick={() => { setTheme(item.id); setAccentColor(item.color) }} className={`rounded-medium border p-2 text-left transition ${theme === item.id ? "border-ink ring-2 ring-ink/10" : "border-ink-hairline"} disabled:opacity-50`}>
                  <span className="block h-9 rounded-small" style={{ background: item.gradient }} />
                  <span className="mt-2 block text-xs font-medium text-ink">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <label className="text-sm text-ink">Highlight colour</label>
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} disabled={!isOwner} className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent disabled:opacity-50" />
              <span className="font-mono text-xs text-ink-muted">{accentColor}</span>
            </div>
            {isOwner && <button type="button" disabled={isPending} onClick={submitStore} className="mt-4 rounded-medium border border-ink-hairline px-4 py-2 text-sm font-medium text-ink hover:bg-white disabled:opacity-50">Save appearance</button>}
          </div>

          <div className="glass-panel rounded-large p-5 small:p-6">
            <h3 className="font-display text-lg font-medium text-ink">Payments</h3>
            <div className="mt-3 flex items-start justify-between gap-4">
              <div><label className="block text-sm text-ink">Accept crypto payments (USDC)</label><p className="mt-1 text-xs text-ink-muted">When off, buyers can’t pay for your products with crypto.</p></div>
              <button type="button" role="switch" aria-checked={cryptoEnabled} disabled={!isOwner || isPending} onClick={() => setCryptoEnabled(!cryptoEnabled)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${cryptoEnabled ? "bg-emerald-600" : "bg-ink-hairline"}`}><span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${cryptoEnabled ? "translate-x-5" : "translate-x-0.5"}`} /></button>
            </div>
            {isOwner && <button type="button" disabled={isPending} onClick={submitPayments} className="mt-4 rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{isPending ? "Saving…" : "Save payment settings"}</button>}
          </div>

        </div>

        <aside className="large:sticky large:top-6 large:self-start">
          <div className="glass-panel overflow-hidden rounded-large p-3">
            <div className="flex items-center justify-between px-2 pb-3"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">Live preview</p><p className="mt-1 text-sm text-ink-muted">What buyers will see</p></div><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700">Preview</span></div>
            <div className="overflow-hidden rounded-medium border border-white/60 bg-white/70 shadow-sm">
              <div className="relative h-28 overflow-hidden" style={{ background: selectedTheme.gradient }}>
                {coverImage && <img src={coverImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-75" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
              <div className="relative px-4 pb-5">
                <div className="-mt-8 flex items-end justify-between"><div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-ink/10 text-xl font-medium text-ink shadow-sm">{logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : (storeName.slice(0, 1) || "Y").toUpperCase()}</div><span className="rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: accentColor }}>Follow</span></div>
                <h4 className="mt-3 font-display text-xl font-medium text-ink">{storeName || "Your store"}</h4><p className="text-xs text-ink-muted">@{publicHandle}</p><p className="mt-3 text-sm leading-6 text-ink-muted">{description || "Your store intro will appear here."}</p>
                <div className="mt-5 grid grid-cols-3 gap-2"><span className="aspect-square rounded-small bg-ink/5" /><span className="aspect-square rounded-small bg-ink/5" /><span className="aspect-square rounded-small bg-ink/5" /></div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {message && <p role="status" className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>{message.text}</p>}
    </div>
  )
}

export default SellerSettingsClient
