import path from 'path'

/**
 * The persisted export-folder setting. Pure logic over an fs-like dependency
 * so it is testable without Electron; main.ts supplies real paths and fs and
 * handles authorization.
 */

export interface ExportFolderPaths {
  /** JSON settings file under app.getPath('userData'). */
  settingsFile: string
  /** app.getPath('downloads'), the default and the fallback. */
  downloads: string
}

export interface ExportFolderFs {
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, data: string): Promise<void>
  /** True when the path is an existing directory the app can write to. */
  isWritableDirectory(dirPath: string): Promise<boolean>
}

export interface ExportFolderInfo {
  path: string
  isDefault: boolean
}

type Settings = Record<string, unknown>

async function readSettings(paths: ExportFolderPaths, fs: ExportFolderFs): Promise<Settings> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(paths.settingsFile))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Settings
  } catch {
    // Missing or corrupt file: behave as if nothing was saved.
  }
  return {}
}

export async function loadExportFolder(paths: ExportFolderPaths, fs: ExportFolderFs): Promise<ExportFolderInfo> {
  const saved = (await readSettings(paths, fs)).exportFolder
  if (typeof saved === 'string' && path.isAbsolute(saved)) {
    try {
      if (await fs.isWritableDirectory(saved)) return { path: saved, isDefault: false }
    } catch {
      // Treat an fs error like a missing folder.
    }
  }
  return { path: paths.downloads, isDefault: true }
}

export async function saveExportFolder(paths: ExportFolderPaths, fs: ExportFolderFs, folder: string): Promise<void> {
  if (!path.isAbsolute(folder)) throw new Error(`Export folder must be an absolute path: ${folder}`)
  const settings = await readSettings(paths, fs)
  await fs.writeFile(paths.settingsFile, JSON.stringify({ ...settings, exportFolder: folder }, null, 2))
}

export async function resetExportFolder(paths: ExportFolderPaths, fs: ExportFolderFs): Promise<void> {
  const settings = await readSettings(paths, fs)
  delete settings.exportFolder
  await fs.writeFile(paths.settingsFile, JSON.stringify(settings, null, 2))
}
