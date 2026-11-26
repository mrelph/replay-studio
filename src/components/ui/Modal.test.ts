import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Modal } from './Modal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null

function render(onClose: () => void, disableClose = false) {
  host = document.createElement('div')
  host.className = 'chrome'
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root!.render(createElement(Modal, { open: true, title: 'Clear All', onClose, disableClose, children: 'Body text' }))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('Modal', () => {
  it('renders into document.body, outside the component that opens it', () => {
    render(() => {})
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(host!.contains(dialog)).toBe(false)
    expect(dialog!.textContent).toContain('Clear All')
    expect(dialog!.textContent).toContain('Body text')
  })

  it('closes on Escape and on a backdrop click, not on a click inside the dialog', () => {
    const onClose = vi.fn()
    render(onClose)
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    act(() => dialog.click())
    expect(onClose).not.toHaveBeenCalled()
    act(() => (dialog.parentElement as HTMLElement).click())
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores Escape and backdrop clicks when disableClose is set', () => {
    const onClose = vi.fn()
    render(onClose, true)
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    act(() => (dialog.parentElement as HTMLElement).click())
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes itself from document.body on unmount', () => {
    render(() => {})
    act(() => root!.unmount())
    root = null
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})
