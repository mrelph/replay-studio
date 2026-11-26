interface RowItem {
  id: string
  startTime: number
  endTime: number
}

export function assignRows(items: RowItem[], minSpan: number, maxRows: number): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.startTime - b.startTime)
  const rowEnds: number[] = []
  const rows = new Map<string, number>()
  for (const item of sorted) {
    const end = Math.max(item.endTime, item.startTime + minSpan)
    let row = rowEnds.findIndex((rowEnd) => rowEnd <= item.startTime)
    if (row === -1) row = rowEnds.length
    rowEnds[row] = end
    rows.set(item.id, row >= maxRows ? row % maxRows : row)
  }
  return rows
}

export function rowCount(rows: Map<string, number>): number {
  let max = -1
  for (const row of rows.values()) if (row > max) max = row
  return max + 1
}
