import type { CSSProperties } from "react"

// Store skins — curated art-directed worlds, not color pickers. Each skin is
// a complete visual identity (banner art, pattern, accent, type flavor) that
// flows through the whole public store page via CSS variables, so the shop
// feels owned instead of decorated.
//
// Backward compatible: the five legacy theme ids (sunset, midnight, mint,
// candy, cobalt) keep working — they are upgraded in place. New ids
// (owambe, market, mono) need no backend migration: `theme` is a free string.

export type StoreSkin = {
  id: string
  label: string
  sublabel: string
  /** Full banner background (gradient + pattern + grain layers). */
  banner: string
  /** Primary action / badge color. */
  accent: string
  /** Text color that sits on the accent. */
  accentInk: string
  /** Card + section border tint. */
  edge: string
  /** Store-name typography flavor (tailwind classes). */
  titleClass: string
  /** Small preview swatch for the picker. */
  swatch: string
  dark?: boolean
}

const grain = (opacity: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='${opacity}'/%3E%3C/svg%3E")`

const dots = (color: string, size: number, gap: number) =>
  `radial-gradient(circle, ${color} ${size}px, transparent ${size + 0.5}px) 0 0 / ${gap}px ${gap}px`

const ankaraGold = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Crect width='56' height='56' fill='none'/%3E%3Ccircle cx='28' cy='28' r='11' fill='none' stroke='%23e8b93c' stroke-width='2'/%3E%3Ccircle cx='28' cy='28' r='3.5' fill='%23e8b93c'/%3E%3Cpath d='M28 0v8M28 48v8M0 28h8M48 28h8' stroke='%23e8b93c' stroke-width='2'/%3E%3Ccircle cx='0' cy='0' r='4' fill='%23e8b93c' opacity='.8'/%3E%3Ccircle cx='56' cy='0' r='4' fill='%23e8b93c' opacity='.8'/%3E%3Ccircle cx='0' cy='56' r='4' fill='%23e8b93c' opacity='.8'/%3E%3Ccircle cx='56' cy='56' r='4' fill='%23e8b93c' opacity='.8'/%3E%3C/svg%3E")`

export const STORE_SKINS: StoreSkin[] = [
  {
    id: "sunset",
    label: "Sunset",
    sublabel: "Warm & inviting",
    banner: `repeating-conic-gradient(from -12deg at 78% 20%, rgba(255,255,255,.14) 0deg 6deg, transparent 6deg 14deg), radial-gradient(circle at 82% 12%, #fde68a 0%, transparent 42%), linear-gradient(135deg,#dc2626 0%,#f97316 55%,#f59e0b 100%)`,
    accent: "#dc2626",
    accentInk: "#ffffff",
    edge: "#dc262633",
    titleClass: "font-display font-semibold tracking-tight",
    swatch: "linear-gradient(135deg,#dc2626,#f59e0b)",
  },
  {
    id: "midnight",
    label: "Midnight",
    sublabel: "Bold & premium",
    banner: `${dots("rgba(255,255,255,.5)", 1, 26)}, ${dots("rgba(165,180,252,.55)", 1.4, 42)}, radial-gradient(ellipse at 85% 0%, #6d28d9 0%, transparent 55%), linear-gradient(135deg,#020617 0%,#1e1b4b 55%,#312e81 100%)`,
    accent: "#818cf8",
    accentInk: "#0b0b1e",
    edge: "#6366f133",
    titleClass: "font-display font-semibold italic tracking-tight",
    swatch: "linear-gradient(135deg,#020617,#6d28d9)",
    dark: true,
  },
  {
    id: "mint",
    label: "Mint",
    sublabel: "Fresh & calm",
    banner: `${dots("rgba(6,78,59,.28)", 1.6, 24)}, radial-gradient(circle at 12% 90%, #a7f3d0 0%, transparent 46%), linear-gradient(135deg,#064e3b 0%,#059669 55%,#34d399 100%)`,
    accent: "#047857",
    accentInk: "#ffffff",
    edge: "#05966933",
    titleClass: "font-display font-medium tracking-tight",
    swatch: "linear-gradient(135deg,#064e3b,#34d399)",
  },
  {
    id: "candy",
    label: "Candy",
    sublabel: "Playful & bright",
    banner: `${dots("rgba(255,255,255,.65)", 2, 30)}, ${dots("rgba(253,242,248,.9)", 1.2, 18)}, radial-gradient(circle at 88% 8%, #f9a8d4 0%, transparent 44%), linear-gradient(135deg,#9d174d 0%,#db2777 50%,#a855f7 100%)`,
    accent: "#db2777",
    accentInk: "#ffffff",
    edge: "#db277733",
    titleClass: "font-display font-semibold tracking-tight",
    swatch: "linear-gradient(135deg,#9d174d,#a855f7)",
  },
  {
    id: "cobalt",
    label: "Cobalt",
    sublabel: "Clean & trusted",
    banner: `repeating-linear-gradient(115deg, rgba(255,255,255,.09) 0 2px, transparent 2px 14px), radial-gradient(circle at 80% 10%, #67e8f9 0%, transparent 40%), linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#0ea5e9 100%)`,
    accent: "#1d4ed8",
    accentInk: "#ffffff",
    edge: "#2563eb33",
    titleClass: "font-display font-medium tracking-[-0.01em]",
    swatch: "linear-gradient(135deg,#1e3a8a,#0ea5e9)",
  },
  {
    id: "owambe",
    label: "Owambe",
    sublabel: "Celebration geometry",
    banner: `${ankaraGold}, ${grain(0.16)}, radial-gradient(circle at 50% 120%, #b45309 0%, transparent 60%), linear-gradient(135deg,#450a0a 0%,#7f1d1d 45%,#14532d 100%)`,
    accent: "#e8b93c",
    accentInk: "#2a1503",
    edge: "#e8b93c44",
    titleClass: "font-display font-bold uppercase tracking-[0.08em]",
    swatch: "linear-gradient(135deg,#7f1d1d 50%,#14532d 50%)",
    dark: true,
  },
  {
    id: "market",
    label: "Market Day",
    sublabel: "Warm paper & ink",
    banner: `${grain(0.35)}, repeating-linear-gradient(178deg, rgba(120,53,15,.10) 0 1px, transparent 1px 9px), radial-gradient(circle at 85% 15%, #fde68a 0%, transparent 45%), linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)`,
    accent: "#92400e",
    accentInk: "#fffbeb",
    edge: "#b4530933",
    titleClass: "font-display font-semibold tracking-tight underline decoration-wavy decoration-amber-600/60 underline-offset-8",
    swatch: "linear-gradient(135deg,#fef3c7,#b45309)",
  },
  {
    id: "mono",
    label: "Mono",
    sublabel: "Editorial minimal",
    banner: `repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 1px, transparent 1px 12px), ${dots("rgba(255,255,255,.35)", 1, 30)}, linear-gradient(135deg,#000000 0%,#27272a 60%,#52525b 100%)`,
    accent: "#fafafa",
    accentInk: "#09090b",
    edge: "#18181b22",
    titleClass: "font-display font-bold uppercase tracking-[0.14em]",
    swatch: "linear-gradient(135deg,#000000,#71717a)",
    dark: true,
  },
]

export const skinFor = (id?: string | null): StoreSkin =>
  STORE_SKINS.find((s) => s.id === (id ?? "")) ?? STORE_SKINS[0]

/** CSS variables that carry the skin through a whole storefront section. */
export const skinVars = (skin: StoreSkin): CSSProperties =>
  ({
    "--store-banner": skin.banner,
    "--store-accent": skin.accent,
    "--store-accent-ink": skin.accentInk,
    "--store-edge": skin.edge,
  }) as CSSProperties

/** Legacy gradient map (kept for old giftcard `design` values + fallbacks). */
export const legacyGradientFor = (variant?: string | null): string => {
  const map: Record<string, string> = {
    sunset: "linear-gradient(135deg,#ef4444,#f59e0b)",
    midnight: "linear-gradient(135deg,#111827,#4338ca)",
    mint: "linear-gradient(135deg,#047857,#a7f3d0)",
    candy: "linear-gradient(135deg,#db2777,#c084fc)",
    cobalt: "linear-gradient(135deg,#2563eb,#22d3ee)",
  }
  return map[variant ?? ""] ?? map.sunset
}
