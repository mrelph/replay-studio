import { describe, it, expect } from 'vitest'
import { updatesAreSupported, type UpdateEnv } from './updater'

function env(overrides: Partial<UpdateEnv>): UpdateEnv {
  return {
    platform: 'linux',
    isPackaged: true,
    appImagePath: undefined,
    ...overrides,
  }
}

describe('updatesAreSupported', () => {
  it('is false when not packaged, regardless of platform', () => {
    expect(updatesAreSupported(env({ platform: 'win32', isPackaged: false }))).toBe(false)
    expect(updatesAreSupported(env({ platform: 'linux', isPackaged: false, appImagePath: '/foo.AppImage' }))).toBe(false)
  })

  it('is true on packaged Windows', () => {
    expect(updatesAreSupported(env({ platform: 'win32', isPackaged: true }))).toBe(true)
  })

  it('is true on packaged Linux running as an AppImage', () => {
    expect(
      updatesAreSupported(env({ platform: 'linux', isPackaged: true, appImagePath: '/home/user/ReplayStudio.AppImage' }))
    ).toBe(true)
  })

  it('is false on packaged Linux not running as an AppImage (deb/pacman installs)', () => {
    expect(updatesAreSupported(env({ platform: 'linux', isPackaged: true, appImagePath: undefined }))).toBe(false)
    expect(updatesAreSupported(env({ platform: 'linux', isPackaged: true, appImagePath: '' }))).toBe(false)
  })

  it('is false on macOS (no macOS target is built)', () => {
    expect(updatesAreSupported(env({ platform: 'darwin', isPackaged: true }))).toBe(false)
  })
})
