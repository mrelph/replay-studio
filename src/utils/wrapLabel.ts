/**
 * Breaks each typed line of `text` between words so no line measures wider
 * than `maxWidth`. A word wider than that gets a line of its own and is not
 * split. The spaces at a break are dropped; a line that fits keeps its spacing.
 */
export function wrapLabel(text: string, maxWidth: number, measure: (line: string) => number): string {
  return text.split('\n').map((line) => wrapLine(line, maxWidth, measure)).join('\n')
}

function wrapLine(line: string, maxWidth: number, measure: (line: string) => number): string {
  if (measure(line) <= maxWidth) return line
  const lines: string[] = []
  let current = ''
  let end = 0
  for (const match of line.matchAll(/( *)([^ ]+)/g)) {
    const [, gap, word] = match
    end = (match.index ?? 0) + match[0].length
    const candidate = current + gap + word
    if (current !== '' && measure(candidate) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  lines.push(current + line.slice(end))
  return lines.join('\n')
}
