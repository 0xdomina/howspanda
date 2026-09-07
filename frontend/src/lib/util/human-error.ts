// Single humanizer for user-facing action errors. Backend-sleep noise and
// SDK internals must never reach shoppers; Medusa renders every 409 as "The
// request conflicted…", so callers that can verify-then-proceed should check
// isConflictError() first and re-read state instead of showing text.
const WARMING_PATTERN =
  /<none>|abort|timed out|timeout|warming|ready["']?\s*:\s*false|booting|fetch failed|load failed/i

export function isWarmingError(err: any): boolean {
  const status = Number(err?.status ?? err?.response?.status)
  if ([502, 503, 504].includes(status)) return true
  return WARMING_PATTERN.test(String(err?.message ?? err ?? ""))
}

export function isConflictError(err: any): boolean {
  const status = Number(err?.status ?? err?.response?.status)
  if (status === 409) return true
  return /conflict|already|duplicate/i.test(String(err?.message ?? err ?? ""))
}

export function toHumanError(
  err: any,
  opts?: { warming?: string; fallback?: string }
): string {
  try {
    if (isWarmingError(err)) {
      return (
        opts?.warming ?? "The store is waking up. Please wait a moment and try again."
      )
    }
    const raw = String(err?.message ?? err?.toString?.() ?? err ?? "").trim()
    if (!raw) return opts?.fallback ?? "Something went wrong."
    return raw
  } catch {
    return opts?.fallback ?? "Something went wrong."
  }
}
