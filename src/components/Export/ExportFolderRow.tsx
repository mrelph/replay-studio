import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui'
import { folderDisplayName } from './useExportFolder'

export interface ExportFolderRowProps {
  folder: string | null
  /** No folder can be used (even Downloads is missing): ask the user to pick one. */
  needsFolder?: boolean
  onChange: () => void
  disabled?: boolean
}

/** "Save to: <folder>" line with a Change… button, shared by the clips and reel export dialogs. */
export default function ExportFolderRow({ folder, needsFolder, onChange, disabled }: ExportFolderRowProps) {
  return (
    <div className="flex items-center gap-3">
      {needsFolder ? (
        <span className="text-sm text-warning truncate flex-1 min-w-0">Choose an export folder</span>
      ) : (
        <span className="text-sm text-text-secondary truncate flex-1 min-w-0" title={folder ?? undefined}>
          Save to: <span className="text-text-primary">{folder ? folderDisplayName(folder) : '…'}</span>
        </span>
      )}
      <Button variant="secondary" size="sm" onClick={onChange} disabled={disabled}>
        <FolderOpen className="w-4 h-4" />
        Change…
      </Button>
    </div>
  )
}
