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

const themes: { id: ThemeName; label: string; sublabel: string; gradient: string; accent: string; ring: string }[] = [
  { id: "sunset", label: "Sunset", sublabel: "Warm & inviting", gradient: "linear-gradient(135deg,#ef4444 0%,#f97316 55%,#f59e0b 100%)", accent: "#ef4444", ring: "ring-orange-200" },
  { id: "midnight", label: "Midnight", sublabel: "Bold & premium", gradient: "linear-gradient(135deg,#0f172a 0%,#1e1b4b 45%,#4338ca 100%)", accent: "#4338ca", ring: "ring-indigo-200" },
  { id: "mint", label: "Mint", sublabel: "Fresh & calm", gradient: "linear-gradient(135deg,#064e3b 0%,#059669 50%,#a7f3d0 100%)", accent: "#059669", ring: "ring-emerald-200" },
  { id: "candy", label: "Candy", sublabel: "Playful & bright", gradient: "linear-gradient(135deg,#be185d 0%,#db2777 50%,#c084fc 100%)", accent: "#db2777", ring: "ring-pink-200" },
  { id: "cobalt", label: "Cobalt", sublabel: "Clean & trusted", gradient: "linear-gradient(135deg,#1e3a8a 0%,#2563eb 50%,#22d3ee 100%)", accent: "#2563eb", ring: "ring-blue-200" },
]

const accentPalette = ["#ef4444","#f97316","#eab308","#059669","#06b6d4","#2563eb","#4338ca","#7c3aed","#db2777","#111827"]

export default function SellerSettingsPremium({ store, isOwner }: { store: StoreInfo; isOwner: boolean }) {
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

  const selectedTheme = themes.find((t) => t.id === theme) ?? themes[0]
  const publicHandle = handle.trim().toLowerCase() || store.handle || "your-store"

  const uploadImage = async (e: ChangeEvent<HTMLInputElement>, target: "logo" | "cover") => {
    const file = e.target.files?.[0]
    if (!file) return
    setMessage(null)
    setUploading(target)
    try {
      const blob = await encodeProductImage(file)
      const res = await uploadSellerMedia(new File([blob], `${target}-${Date.now()}.webp`, { type: blob.type }), "image")
      if (res.url) {
        if (target === "logo") setLogo(res.url)
        else setCoverImage(res.url)
      } else setMessage({ ok: false, text: res.error ?? "Could not upload that image." })
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message ?? "Could not process that image." })
    } finally {
      setUploading(null)
      e.target.value = ""
    }
  }

  const save = (payload: Record<string, unknown>) => {
    setMessage(null)
    startTransition(async () => {
      const res = await updateSellerStore(payload as any)
      setMessage(res.success ? { ok: true, text: "Your storefront is updated." } : { ok: false, text: res.error ?? "Could not save." })
    })
  }

  const submitStore = () => {
    if (!storeName.trim()) { setMessage({ ok: false, text: "Store name is required." }); return }
    save({ name: storeName.trim(), handle: handle.trim().toLowerCase() || undefined, logo: logo.trim() || null, cover_image: coverImage.trim() || null, description: description.trim() || null, accent_color: accentColor, theme })
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 small:flex-row small:items-end small:justify-between">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">Store settings</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Craft a storefront that feels like you — glass, light, and your story. Buyers see it instantly.</p>
        </div>
        <LocalizedClientLink href={`/store/${publicHandle}`} target="_blank" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-ink/90">View live store <span aria-hidden>↗</span></LocalizedClientLink>
      </div>

      <div className="grid gap-8 large:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)]">
        <div className="space-y-6">
          <div className="glass-panel rounded-large p-6 small:p-7">
            <h3 className="font-display text-lg font-medium text-ink">Your storefront</h3>
            <p className="mt-1 text-sm text-ink-muted">The public profile buyers will see and share.</p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink">Store name</label>
                <input value={storeName} onChange={(e) => setStoreName(e.target.value)} disabled={!isOwner} placeholder="e.g. Ada's Fabrics" className="w-full rounded-control border border-ink-hairline bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:opacity-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink">Your store link</label>
                <div className="flex items-center gap-2">
                  <span className="hidden shrink-0 text-sm text-ink-muted small:inline">howsu.com/store/</span>
                  <input value={handle} onChange={(e) => setHandle(e.target.value)} disabled={!isOwner} placeholder="adas-fabrics" className="min-w-0 flex-1 rounded-control border border-ink-hairline bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:opacity-50" />
                  <LocalizedClientLink href={`/store/${publicHandle}`} target="_blank" className="shrink-0 rounded-control border border-ink-hairline bg-white px-4 py-3 text-sm font-medium text-ink shadow-sm hover:bg-paper-tinted">Open</LocalizedClientLink>
                </div>
                <p className="mt-1.5 text-xs text-ink-muted">/store/{publicHandle} · share this anywhere</p>
              </div>
              <div className="grid gap-4 small:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink">Profile image</label>
                  <label className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-control border border-dashed border-ink-hairline bg-white/60 px-4 py-6 text-center shadow-sm transition hover:bg-white">
                    <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-ink/10 text-ink">{logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : (storeName.slice(0,1) || "Y")}</span>
                    <span className="text-sm font-medium text-ink">{uploading==="logo" ? "Preparing…" : logo ? "Change image" : "Upload image"}</span>
                    <span className="text-xs text-ink-muted">JPG, PNG, WebP</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={!isOwner || uploading!==null} onChange={(e)=>uploadImage(e,"logo")} />
                  </label>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink">Cover image</label>
                  <label className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-control border border-dashed border-ink-hairline bg-white/60 px-4 py-6 text-center shadow-sm transition hover:bg-white">
                    <span className="h-20 w-full overflow-hidden rounded-small border border-ink-hairline bg-ink/5">{coverImage ? <img src={coverImage} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-xs text-ink-muted">No cover yet</span>}</span>
                    <span className="text-sm font-medium text-ink">{uploading==="cover" ? "Preparing…" : coverImage ? "Change cover" : "Upload cover"}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={!isOwner || uploading!==null} onChange={(e)=>uploadImage(e,"cover")} />
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink">Short intro</label>
                <textarea value={description} onChange={(e)=>setDescription(e.target.value)} disabled={!isOwner} rows={3} maxLength={1000} placeholder="Tell people what makes your store special — what you sell, why they’ll love it." className="w-full rounded-control border border-ink-hairline bg-white/80 px-4 py-3 text-sm leading-6 text-ink shadow-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:opacity-50" />
                <p className="mt-1 text-right text-xs text-ink-muted">{description.length}/1000</p>
              </div>
              {isOwner && <button type="button" disabled={isPending || uploading!==null} onClick={submitStore} className="w-full rounded-control bg-ink px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-ink/90 disabled:opacity-50">{isPending ? "Saving…" : "Save storefront"}</button>}
              {!isOwner && <p className="text-center text-xs text-ink-muted">Only the owner can edit the storefront.</p>}
            </div>
          </div>

          <div className="glass-panel rounded-large p-6 small:p-7">
            <h3 className="font-display text-lg font-medium text-ink">Look and feel</h3>
            <p className="mt-1 text-sm text-ink-muted">Five crafted themes — each with its own glass, gradient, and accent. Not a color picker.</p>
            <div className="mt-6 grid grid-cols-1 gap-3 small:grid-cols-2">
              {themes.map((t)=>(
                <button key={t.id} type="button" disabled={!isOwner} onClick={()=>{ setTheme(t.id); setAccentColor(t.accent)}} className={`group relative overflow-hidden rounded-large border p-3 text-left shadow-sm transition disabled:opacity-50 ${theme===t.id ? "border-ink ring-2 ring-ink/10" : "border-white/60 hover:border-ink/20"}`}>
                  <div className="relative h-20 overflow-hidden rounded-control" style={{background:t.gradient}}>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-ink shadow-sm">{t.label}</span>
                      <span className="h-6 w-6 rounded-full border-2 border-white shadow-sm" style={{background:t.accent}} />
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-medium text-ink">{t.label}</p>
                  <p className="text-xs text-ink-muted">{t.sublabel}</p>
                  {theme===t.id && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-ink text-white">✓</span>}
                </button>
              ))}
            </div>
            <div className="mt-6 rounded-control border border-ink-hairline bg-white/70 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Accent</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {accentPalette.map((c)=>(
                  <button key={c} type="button" disabled={!isOwner} onClick={()=>setAccentColor(c)} className={`h-9 w-9 rounded-full border-2 shadow-sm transition hover:scale-105 ${accentColor===c ? "border-ink ring-2 ring-ink/10" : "border-white"}`} style={{background:c}} aria-label={c} />
                ))}
                <label className="grid h-9 w-9 place-items-center rounded-full border-2 border-dashed border-ink-hairline bg-white text-ink shadow-sm hover:bg-paper-tinted">
                  <input type="color" value={accentColor} onChange={(e)=>setAccentColor(e.target.value)} disabled={!isOwner} className="sr-only" />
                  <span className="text-lg leading-none">＋</span>
                </label>
              </div>
              <p className="mt-2 font-mono text-xs text-ink-muted">{accentColor}</p>
            </div>
            {isOwner && <button type="button" disabled={isPending} onClick={submitStore} className="mt-4 w-full rounded-control border border-ink-hairline bg-white px-4 py-3 text-sm font-medium text-ink shadow-sm hover:bg-paper-tinted disabled:opacity-50">Save appearance</button>}
          </div>

          <div className="glass-panel rounded-large p-6 small:p-7">
            <h3 className="font-display text-lg font-medium text-ink">Payments</h3>
            <div className="mt-4 flex items-start justify-between gap-4 rounded-control border border-ink-hairline bg-white/70 p-4">
              <div><p className="text-sm font-medium text-ink">Accept crypto (USDC)</p><p className="mt-1 text-xs leading-5 text-ink-muted">When off, buyers can’t pay for your products with crypto. Bank and Paystack stay on.</p></div>
              <button type="button" role="switch" aria-checked={cryptoEnabled} disabled={!isOwner || isPending} onClick={()=>setCryptoEnabled(!cryptoEnabled)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${cryptoEnabled ? "bg-emerald-600" : "bg-ink-hairline"}`}><span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${cryptoEnabled ? "translate-x-5" : "translate-x-0.5"}`} /></button>
            </div>
            {isOwner && <button type="button" disabled={isPending} onClick={()=>{ setMessage(null); startTransition(async()=>{ const r=await updateSellerStore({crypto_payments_enabled:cryptoEnabled}); setMessage(r.success?{ok:true,text:"Payment settings saved."}:{ok:false,text:r.error??"Could not save."}) })}} className="mt-4 rounded-control bg-ink px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-ink/90 disabled:opacity-50">{isPending ? "Saving…" : "Save payment settings"}</button>}
          </div>
        </div>

        <aside className="large:sticky large:top-6 large:self-start">
          <div className="glass-panel overflow-hidden rounded-large p-3 shadow-sm">
            <div className="flex items-center justify-between px-2 pb-3">
              <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">Live preview</p><p className="mt-1 text-sm text-ink-muted">What buyers will see — updates as you type</p></div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Preview</span>
            </div>
            <div key={theme+accentColor+coverImage+logo} className="overflow-hidden rounded-large border border-white/60 bg-white/80 shadow-sm transition-all duration-500">
              <div className="relative h-28 overflow-hidden" style={{background: selectedTheme.gradient}}>
                {coverImage && <img src={coverImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity duration-500" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
                <div className="absolute inset-0 backdrop-blur-[0.5px]" />
              </div>
              <div className="relative bg-white/85 px-5 pb-6 backdrop-blur">
                <div className="-mt-8 flex items-end justify-between">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-ink/10 text-xl font-medium text-ink shadow-md transition-all duration-500">{logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : (storeName.slice(0,1) || "Y").toUpperCase()}</div>
                  <span className="rounded-full px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-colors duration-300" style={{backgroundColor: accentColor}}>Follow</span>
                </div>
                <h4 className="mt-4 font-display text-xl font-medium text-ink">{storeName || "Your store"}</h4>
                <p className="text-xs text-ink-muted">@{publicHandle}</p>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink/80">{description || "Your store intro will appear here. Make it warm, make it you."}</p>
                <div className="mt-6 grid grid-cols-3 gap-2">
                  {[0,1,2].map((i)=>(
                    <div key={i} className="group relative aspect-square overflow-hidden rounded-control border border-ink-hairline bg-ink/5 transition hover:-translate-y-0.5 hover:shadow-sm">
                      <span className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-60" />
                      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-ink shadow-sm" style={{color:accentColor}}>New</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-ink-muted">
                  <span>3 products · 127 followers</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{background:accentColor}} /> {selectedTheme.label}</span>
                </div>
              </div>
            </div>
            <p className="mt-3 px-2 text-center text-xs leading-5 text-ink-muted">Tip: the real store at <span className="font-medium text-ink">/store/{publicHandle}</span> uses the same glass + theme. Share it anywhere.</p>
          </div>
        </aside>
      </div>
      {message && <p role="status" className={`rounded-control border px-4 py-3 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{message.text}</p>}
    </div>
  )
}
