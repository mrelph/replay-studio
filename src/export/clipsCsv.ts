// Pure builder for the `clips.csv` written into the export folder after an
// export run (see ExportClipsDialog.tsx). RFC 4180 quoting, plus a defense
// against spreadsheet formula injection (Excel/Sheets/Numbers all execute a
// cell that starts with certain characters when the CSV is opened).

export type ClipCsvStatus = 'exported' | 'failed' | 'cancelled'

export interface ClipCsvRow {
  /** 1-based order in the clip list. */
  number: number
  name: string
  /** Source-video seconds. */
  start: number
  /** Source-video seconds. */
  end: number
  tags: string[]
  notes: string
  /** The burned-in output file name (not a full path), e.g. "01 - Name [tag].mp4". */
  file: string
  status: ClipCsvStatus
}

const CSV_HEADER = ['Number', 'Name', 'Start', 'End', 'Duration', 'Tags', 'Notes', 'File', 'Status']

// Characters that make some spreadsheet apps treat a cell as a formula when
// the CSV is opened. Also guards tab/CR, which some parsers treat the same way.
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r'])

/** `hh:mm:ss.f` (tenths of a second), used for CSV start/end/duration columns. */
export function formatCsvTimecode(seconds: number): string {
  const total = Math.max(0, seconds)
  // Round to the nearest tenth of a second first (as an integer count of
  // tenths) so float error (e.g. 3725.7 % 60 landing on 5.699999999999932)
  // can't truncate to the wrong tenths digit.
  const totalTenths = Math.round(total * 10)
  const hours = Math.floor(totalTenths / 36000)
  const minutes = Math.floor((totalTenths % 36000) / 600)
  const wholeSeconds = Math.floor((totalTenths % 600) / 10)
  const tenths = totalTenths % 10
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${wholeSeconds
    .toString()
    .padStart(2, '0')}.${tenths}`
}

/** Prefixes a leading `'` when the value would otherwise be read as a formula by a spreadsheet app. */
function neutralizeFormulaInjection(value: string): string {
  if (value.length === 0) return value
  return FORMULA_TRIGGER_CHARS.has(value[0]) ? `'${value}` : value
}

/** RFC 4180 field quoting: quote if it contains a comma, quote, CR or LF; double any inner quotes. */
function csvField(raw: string): string {
  const neutralized = neutralizeFormulaInjection(raw)
  if (!/[",\r\n]/.test(neutralized)) return neutralized
  return `"${neutralized.replace(/"/g, '""')}"`
}

function csvLine(fields: string[]): string {
  return fields.map(csvField).join(',')
}

/** Builds a full `clips.csv` (header + one row per clip), CRLF line endings per RFC 4180. */
export function buildClipsCsv(rows: ClipCsvRow[]): string {
  const lines = [csvLine(CSV_HEADER)]
  for (const row of rows) {
    lines.push(
      csvLine([
        String(row.number),
        row.name,
        formatCsvTimecode(row.start),
        formatCsvTimecode(row.end),
        formatCsvTimecode(row.end - row.start),
        row.tags.join(';'),
        row.notes,
        row.file,
        row.status,
      ])
    )
  }
  return lines.join('\r\n') + '\r\n'
}
