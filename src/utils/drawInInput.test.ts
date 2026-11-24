import { describe, it, expect } from 'vitest'
import { parseDrawIn } from './drawInInput'

describe('parseDrawIn', () => {
  it.each([['', 0], ['abc', 0], ['-1', 0], ['0.35', 0.35], ['0.333', 0.33], ['9', 2], ['2', 2]])(
    'parseDrawIn(%j) → %d (Review Focus 5)', (raw, out) => expect(parseDrawIn(raw)).toBe(out))
})
