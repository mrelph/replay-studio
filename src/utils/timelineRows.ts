interface RowItem {
  id: string
  startTime: number
  endTime: number
}

export function assignRows(items: RowItem[], minSpan: number): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.startTime - b.startTime)
  const rowEnds: number[] = []
  const rows = new Map<string, number>()
  for (const item of sorted) {
    const end = Math.max(item.endTime, item.startTime + minSpan)
    let row = rowEnds.findIndex((rowEnd) => rowEnd <= item.startTime)
    if (row === -1) row = rowEnds.length
    rowEnds[row] = end
    rows.set(item.id, row)
  }
  return rows
}

export function rowCount(rows: Map<string, number>): number {
  let max = -1
  for (const row of rows.values()) if (row > max) max = row
  return max + 1
}

export function laneTopFor(hasSpeed: boolean, hasVoice: boolean): { px: number; cls: string } {
  const px = 32 + (hasSpeed ? 16 : 0) + (hasVoice ? 16 : 0)
  return { px, cls: px === 64 ? 'top-16' : px === 48 ? 'top-12' : 'top-8' }
}

const ROW_HEIGHT = 28
const MAX_AUTO_ROWS = 8

export function autoLaneHeight(rows: number, laneTopPx: number): number {
  return Math.max(96, laneTopPx + Math.min(rows, MAX_AUTO_ROWS) * ROW_HEIGHT + 8)
}

export function hiddenRowsBelow(scrollTop: number, viewportHeight: number, rows: number): number {
  return Math.max(0, rows - Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT))
}
