// Gift-card occasions — artwork with intent, not gradients with text.
// Each occasion is a complete illustrated world (mesh + motif + grain) plus
// the sentiment line buyers expect on a card for that moment.
//
// Zero-backend-change encoding: the occasion rides in the existing free-form
// `design_variant` string as "occasion:<id>". Legacy gradient ids
// (sunset, midnight, …) keep rendering exactly as before.

export type CardOccasion = {
  id: string
  label: string
  /** Eyebrow sentiment printed on the card for this moment. */
  sentiment: string
  /** Full card background: motif + glow + mesh. */
  art: string
  /** Foil sheen tint for the animated sweep. */
  foil: string
  /** Suggested highlight color when the seller picks this occasion. */
  accent: string
}

const grain = (opacity: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='${opacity}'/%3E%3C/svg%3E")`

const svg = (inner: string, size = 72) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'%3E${inner}%3C/svg%3E")`

const confetti = (c1: string, c2: string, size = 72) =>
  svg(
    `%3Ccircle cx='14' cy='18' r='5' fill='${c1}'/%3E%3Crect x='42' y='10' width='9' height='9' rx='2' transform='rotate(24 46 14)' fill='${c2}'/%3E%3Ccircle cx='58' cy='48' r='4' fill='${c1}'/%3E%3Crect x='12' y='46' width='8' height='8' rx='2' transform='rotate(-18 16 50)' fill='${c2}'/%3E%3Ccircle cx='36' cy='34' r='2.4' fill='${c2}'/%3E`,
    size
  )

export const CARD_OCCASIONS: CardOccasion[] = [
  {
    id: "birthday",
    label: "Birthday",
    sentiment: "Happy birthday",
    art: `${confetti("%23fde68a", "%23f9a8d4")}, ${grain(0.14)}, radial-gradient(circle at 85% 10%, #f9a8d4 0%, transparent 46%), radial-gradient(circle at 10% 95%, #fde68a 0%, transparent 42%), linear-gradient(135deg,#9d174d 0%,#db2777 48%,#7c3aed 100%)`,
    foil: "rgba(253,230,138,.55)",
    accent: "#f9a8d4",
  },
  {
    id: "wedding",
    label: "Wedding & Owambe",
    sentiment: "Best wishes",
    art: `${svg(`%3Ccircle cx='26' cy='36' r='13' fill='none' stroke='%23e8b93c' stroke-width='3'/%3E%3Ccircle cx='46' cy='36' r='13' fill='none' stroke='%23f6e3a1' stroke-width='3'/%3E%3Ccircle cx='36' cy='12' r='2.5' fill='%23e8b93c'/%3E`)}, ${grain(0.16)}, radial-gradient(circle at 50% 125%, #b45309 0%, transparent 58%), linear-gradient(135deg,#3b0764 0%,#701a45 55%,#0c4a3e 130%)`,
    foil: "rgba(232,185,60,.5)",
    accent: "#e8b93c",
  },
  {
    id: "thank-you",
    label: "Thank You",
    sentiment: "With gratitude",
    art: `${svg(`%3Cg stroke='%23fde68a' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M36 8v10M36 54v10M8 36h10M54 36h10M16 16l7 7M49 49l7 7M56 16l-7 7M23 49l-7 7'/%3E%3C/g%3E%3Ccircle cx='36' cy='36' r='9' fill='%23fde68a'/%3E`)}, ${grain(0.12)}, radial-gradient(circle at 50% 30%, #fbbf24 0%, transparent 50%), linear-gradient(135deg,#78350f 0%,#b45309 55%,#f59e0b 100%)`,
    foil: "rgba(255,251,235,.5)",
    accent: "#fde68a",
  },
  {
    id: "christmas",
    label: "Christmas",
    sentiment: "Season's greetings",
    art: `${svg(`%3Ccircle cx='14' cy='16' r='2.2' fill='white'/%3E%3Ccircle cx='40' cy='10' r='1.6' fill='white'/%3E%3Ccircle cx='58' cy='30' r='2.2' fill='white'/%3E%3Ccircle cx='26' cy='44' r='1.6' fill='white'/%3E%3Ccircle cx='50' cy='58' r='2.2' fill='white'/%3E%3Ccircle cx='10' cy='58' r='1.6' fill='white'/%3E%3Cpath d='M36 12l10 16h-6l8 12H24l8-12h-6z' fill='%2316a34a'/%3E%3Crect x='33.5' y='40' width='5' height='7' fill='%2392400e'/%3E`)}, ${grain(0.14)}, radial-gradient(circle at 85% 8%, #fca5a5 0%, transparent 44%), linear-gradient(135deg,#052e16 0%,#14532d 55%,#7f1d1d 130%)`,
    foil: "rgba(254,242,242,.45)",
    accent: "#fca5a5",
  },
  {
    id: "eid",
    label: "Eid",
    sentiment: "Eid Mubarak",
    art: `${svg(`%3Cpath d='M44 10a22 22 0 100 52 17 17 0 110-52z' fill='%23e8b93c'/%3E%3Ccircle cx='52' cy='22' r='2.4' fill='%23e8b93c'/%3E%3Ccircle cx='60' cy='36' r='1.8' fill='%23f6e3a1'/%3E%3Ccircle cx='14' cy='52' r='1.8' fill='%23f6e3a1'/%3E`)}, ${grain(0.14)}, radial-gradient(circle at 80% 90%, #0d9488 0%, transparent 55%), linear-gradient(135deg,#042f2e 0%,#134e4a 55%,#1e1b4b 130%)`,
    foil: "rgba(232,185,60,.5)",
    accent: "#5eead4",
  },
  {
    id: "new-baby",
    label: "New Baby",
    sentiment: "Welcome little one",
    art: `${svg(`%3Cpath d='M50 12a14 14 0 100 32 11 11 0 110-32z' fill='%23fbcfe8'/%3E%3Ccircle cx='18' cy='20' r='2' fill='white'/%3E%3Ccircle cx='26' cy='48' r='2.4' fill='white'/%3E%3Ccircle cx='56' cy='52' r='2' fill='%23fbcfe8'/%3E`)}, ${grain(0.1)}, radial-gradient(circle at 15% 85%, #f9a8d4 0%, transparent 48%), linear-gradient(135deg,#60a5fa 0%,#a78bfa 55%,#f472b6 130%)`,
    foil: "rgba(255,255,255,.55)",
    accent: "#fbcfe8",
  },
  {
    id: "graduation",
    label: "Graduation",
    sentiment: "You did it",
    art: `${svg(`%3Cpath d='M36 14L8 26l28 12 24-10.3V44h4V26z' fill='%23e8b93c'/%3E%3Cpath d='M20 32v10c0 4 32 4 32 0V32l-16 7z' fill='%23b45309'/%3E%3Ccircle cx='60' cy='14' r='2' fill='%23e8b93c'/%3E%3Ccircle cx='12' cy='54' r='2' fill='%23e8b93c'/%3E`)}, ${grain(0.14)}, radial-gradient(circle at 85% 10%, #f59e0b 0%, transparent 42%), linear-gradient(135deg,#020617 0%,#1e3a8a 60%,#0f172a 100%)`,
    foil: "rgba(232,185,60,.5)",
    accent: "#fbbf24",
  },
  {
    id: "just-because",
    label: "Just Because",
    sentiment: "Made to keep",
    art: `${svg(`%3Cpath d='M36 10l3.5 8.5L48 22l-8.5 3.5L36 34l-3.5-8.5L24 22l8.5-3.5z' fill='white'/%3E%3Ccircle cx='56' cy='50' r='2' fill='white'/%3E%3Ccircle cx='14' cy='52' r='2.4' fill='white'/%3E`)}, ${grain(0.12)}, radial-gradient(circle at 85% 15%, #f0abfc 0%, transparent 46%), radial-gradient(circle at 10% 90%, #67e8f9 0%, transparent 44%), linear-gradient(135deg,#4c1d95 0%,#9d174d 55%,#0c4a3e 130%)`,
    foil: "rgba(240,171,252,.5)",
    accent: "#f0abfc",
  },
]

export const OCCASION_PREFIX = "occasion:"

export const occasionFor = (design?: string | null): CardOccasion | null => {
  if (!design || !design.startsWith(OCCASION_PREFIX)) return null
  const id = design.slice(OCCASION_PREFIX.length)
  return CARD_OCCASIONS.find((o) => o.id === id) ?? null
}

export const occasionDesignValue = (id: string): string => `${OCCASION_PREFIX}${id}`
