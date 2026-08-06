// Client-side ID card processing: image preprocessing for OCR and text
// cleaning/extraction. Everything here is pure client code (no server round
// trip); the extracted JSON is what gets sent to the backend NIN match.

export type ExtractedNinDoc = {
  id_number?: string | null
  first_name?: string | null
  last_name?: string | null
  other_name?: string | null
  date_of_birth?: string | null
  country?: string | null
  state?: string | null
  city?: string | null
  address?: string | null
}

// --- preprocessing ----------------------------------------------------------

// Normalize an ID photo before OCR: scale to a reasonable size, flatten to
// grayscale and boost contrast. Preprocessing is the main accuracy lever for
// Tesseract (research result: deskew + binarize + upscale to ~200–300 DPI).
export async function preprocessImage(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error("Could not load the image"))
    i.src = dataUrl
  })

  const maxDim = 2000
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(320, Math.round(img.naturalWidth * scale))
  const h = Math.max(240, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is not available")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const v = gray > 128 ? Math.min(255, gray + 25) : Math.max(0, gray - 25)
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
  }
  ctx.putImageData(imageData, 0, 0)

  return canvas.toDataURL("image/jpeg", 0.9)
}

// --- cleaning + extraction ---------------------------------------------------

export function cleanOcrLines(raw: string): string[] {
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

// The value that follows a label marker, e.g. "SURNAME: ADE" → "ADE".
function valueAfterLabel(line: string, label: string): string | null {
  const idx = line.toLowerCase().indexOf(label.toLowerCase())
  if (idx === -1) return null
  const rest = line.slice(idx + label.length).replace(/^[:.\s\-\u00b7]+/, "")
  return rest.trim() || null
}

const DOB_RE =
  /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}|\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2})\b/

// Turn raw OCR text into a candidate ExtractedNinDoc. Best-effort: fields OCR
// misses are left for the user to correct in the review form (and the backend
// match re-checks everything server-side anyway).
export function extractFromLines(lines: string[]): ExtractedNinDoc {
  const doc: ExtractedNinDoc = {}

  for (const line of lines) {
    const nin = line.match(/\b\d{11}\b/)
    if (nin && !doc.id_number) doc.id_number = nin[0]

    const dob = line.match(DOB_RE)
    if (dob && !doc.date_of_birth) doc.date_of_birth = dob[1]
  }

  for (const line of lines) {
    const lower = line.toLowerCase()
    if (!doc.last_name && /surname|last\s?name/.test(lower)) {
      doc.last_name =
        valueAfterLabel(line, /last\s?name/.test(lower) ? "Last Name" : "SURNAME") ??
        valueAfterLabel(line, "Surname") ??
        valueAfterLabel(line, "surname")
    } else if (!doc.first_name && /first\s?name|given\s?name/.test(lower)) {
      doc.first_name =
        valueAfterLabel(line, "First Name") ??
        valueAfterLabel(line, "Given Name") ??
        valueAfterLabel(line, "first name")
    } else if (!doc.other_name && /middle\s?name|other\s?name/.test(lower)) {
      doc.other_name =
        valueAfterLabel(line, "Middle Name") ??
        valueAfterLabel(line, "Other Name") ??
        valueAfterLabel(line, "middle name")
    }
  }

  return doc
}
