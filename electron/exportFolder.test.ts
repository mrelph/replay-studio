import { describe, it, expect } from 'vitest'
import {
  loadExportFolder,
  saveExportFolder,
  resetExportFolder,
  type ExportFolderFs,
  type ExportFolderPaths,
} from './exportFolder'

const paths: ExportFolderPaths = {
  settingsFile: '/userData/export-folder.json',
  downloads: '/home/me/Downloads',
}

/** In-memory fs: `files` holds file contents, `dirs` lists existing directories, `readOnly` unwritable ones. */
function memoryFs(opts: { files?: Record<string, string>; dirs?: string[]; readOnly?: string[] } = {}) {
  const files = new Map(Object.entries(opts.files ?? {}))
  const dirs = new Set(opts.dirs ?? [paths.downloads])
  const readOnly = new Set(opts.readOnly ?? [])
  const missing = (p: string) => Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' })
  const fs: ExportFolderFs = {
    readFile: async (p) => {
      const content = files.get(p)
      if (content === undefined) throw missing(p)
      return content
    },
    writeFile: async (p, data) => {
      files.set(p, data)
    },
    isWritableDirectory: async (p) => dirs.has(p) && !readOnly.has(p),
  }
  return { fs, files, dirs }
}

describe('loadExportFolder', () => {
  it('falls back to Downloads when there is no settings file', async () => {
    const { fs } = memoryFs()
    expect(await loadExportFolder(paths, fs)).toEqual({ path: paths.downloads, isDefault: true })
  })

  it('returns a saved folder that exists', async () => {
    const { fs } = memoryFs({
      files: { [paths.settingsFile]: JSON.stringify({ exportFolder: '/videos/out' }) },
      dirs: [paths.downloads, '/videos/out'],
    })
    expect(await loadExportFolder(paths, fs)).toEqual({ path: '/videos/out', isDefault: false })
  })

  it('falls back to Downloads when the saved folder no longer exists', async () => {
    const { fs } = memoryFs({ files: { [paths.settingsFile]: JSON.stringify({ exportFolder: '/gone' }) } })
    expect(await loadExportFolder(paths, fs)).toEqual({ path: paths.downloads, isDefault: true })
  })

  it('falls back to Downloads when the saved folder is not writable', async () => {
    const { fs } = memoryFs({
      files: { [paths.settingsFile]: JSON.stringify({ exportFolder: '/locked' }) },
      dirs: [paths.downloads, '/locked'],
      readOnly: ['/locked'],
    })
    expect(await loadExportFolder(paths, fs)).toEqual({ path: paths.downloads, isDefault: true })
  })

  it('falls back to Downloads on a corrupt settings file without throwing', async () => {
    for (const content of ['{not json', 'null', '[]', '42', JSON.stringify({ exportFolder: 7 })]) {
      const { fs } = memoryFs({ files: { [paths.settingsFile]: content } })
      expect(await loadExportFolder(paths, fs)).toEqual({ path: paths.downloads, isDefault: true })
    }
  })

  it('ignores a saved value that is not an absolute path', async () => {
    const { fs } = memoryFs({
      files: { [paths.settingsFile]: JSON.stringify({ exportFolder: 'videos/out' }) },
      dirs: [paths.downloads, 'videos/out'],
    })
    expect(await loadExportFolder(paths, fs)).toEqual({ path: paths.downloads, isDefault: true })
  })
})

describe('saveExportFolder / resetExportFolder', () => {
  it('round-trips a saved folder', async () => {
    const { fs } = memoryFs({ dirs: [paths.downloads, '/videos/out'] })
    await saveExportFolder(paths, fs, '/videos/out')
    expect(await loadExportFolder(paths, fs)).toEqual({ path: '/videos/out', isDefault: false })
  })

  it('reset removes the saved value', async () => {
    const { fs, files } = memoryFs({ dirs: [paths.downloads, '/videos/out'] })
    await saveExportFolder(paths, fs, '/videos/out')
    await resetExportFolder(paths, fs)
    expect(JSON.parse(files.get(paths.settingsFile)!)).not.toHaveProperty('exportFolder')
    expect(await loadExportFolder(paths, fs)).toEqual({ path: paths.downloads, isDefault: true })
  })

  it('reset is harmless with no settings file or a corrupt one', async () => {
    for (const files of [{}, { [paths.settingsFile]: '{not json' }]) {
      const { fs } = memoryFs({ files })
      await expect(resetExportFolder(paths, fs)).resolves.toBeUndefined()
      expect(await loadExportFolder(paths, fs)).toEqual({ path: paths.downloads, isDefault: true })
    }
  })

  it('refuses to save a relative path', async () => {
    const { fs, files } = memoryFs()
    await expect(saveExportFolder(paths, fs, 'relative/dir')).rejects.toThrow()
    expect(files.has(paths.settingsFile)).toBe(false)
  })
})
