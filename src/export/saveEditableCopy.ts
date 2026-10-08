import type { Annotation } from '@/stores/drawingStore'
import type { Clip, ClipExportQuality, ClipExportResult } from '@/types/clip'
import { exportProjectToJSON } from '@/utils/projectSerializer'
import { buildEditableProject } from './editableCopy'

export interface SaveEditableCopyOptions {
  clip: Clip
  annotations: Annotation[]
  sourcePath: string
  folder: string
  /** Shared base file name (see buildClipBaseName); the copy is `<base>.clean.mp4` + `<base>.rsproj`. */
  baseName: string
  quality: ClipExportQuality
  fps: number
}

/**
 * The "editable copy" of an exported clip: the clip's video without drawings
 * plus a Replay Studio project pointing at it, with the clip's annotations
 * rebased to t=0, so it can be reopened and re-annotated later.
 */
export async function saveEditableCopy(opts: SaveEditableCopyOptions): Promise<ClipExportResult> {
  const { clip, annotations, sourcePath, folder, baseName, quality, fps } = opts
  const cleanPath = `${folder}/${baseName}.clean.mp4`
  const projectPath = `${folder}/${baseName}.rsproj`

  const cleanResult = await window.electronAPI.exportVideo({
    inputPath: sourcePath,
    outputPath: cleanPath,
    startTime: clip.start,
    endTime: clip.end,
    quality,
    fps,
    format: 'mp4',
  })
  if (!cleanResult.success) return { success: false, error: cleanResult.error || 'Editable copy export failed' }

  const project = buildEditableProject(clip, annotations, cleanPath, baseName)
  const writeResult = await window.electronAPI.writeFile(projectPath, exportProjectToJSON(project))
  if (!writeResult.success) return { success: false, error: writeResult.error || 'Could not save project file' }
  return { success: true }
}
