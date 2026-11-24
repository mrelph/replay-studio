export function parseDrawIn(raw: string): number {
  const value = parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(Math.min(value, 2) * 100) / 100
}
