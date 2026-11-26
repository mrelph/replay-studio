import { describe, it, expect } from 'vitest'
import { useToolStore } from '@/stores/toolStore'
import { liveToolContext } from './toolContext'

describe('liveToolContext', () => {
  it('reads colour, width and style from the store when the tool reads them', () => {
    useToolStore.setState({ strokeColor: '#ff0000', strokeWidth: 4, annotationStyle: 'outline' })
    const ctx = liveToolContext({} as fabric.Canvas, () => {})
    useToolStore.setState({ strokeColor: '#00ff00', strokeWidth: 6, annotationStyle: 'clean' })
    expect(ctx.color).toBe('#00ff00')
    expect(ctx.strokeWidth).toBe(6)
    expect(ctx.style).toBe('clean')
  })
})
