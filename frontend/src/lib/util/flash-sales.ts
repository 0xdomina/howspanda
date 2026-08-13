export const FLASH_SALE_DURATION_MS = 3 * 24 * 60 * 60 * 1000
export const FLASH_SALE_EPOCH_MS = Date.UTC(2026, 0, 1)

export const getFlashSaleCycle = (now = Date.now()) => {
  const id = Math.max(0, Math.floor((now - FLASH_SALE_EPOCH_MS) / FLASH_SALE_DURATION_MS))
  const startsAt = FLASH_SALE_EPOCH_MS + id * FLASH_SALE_DURATION_MS

  return {
    id,
    startsAt,
    endsAt: startsAt + FLASH_SALE_DURATION_MS,
  }
}
