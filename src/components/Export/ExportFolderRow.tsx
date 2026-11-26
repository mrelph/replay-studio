import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui'
import { folderDisplayName } from './useExportFolder'

export interface ExportFolderRowProps {
  folder: string | null
  onChange: () => void
  disabled?: boolean
}

/** "Save to: <folder>" line with a Change… button, shared by the clips and reel export dialogs. */
export default function ExportFolderRow({ folder, onChange, disabled }: ExportFolderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-text-secondary truncate flex-1 min-w-0" title={folder ?? undefined}>
        Save to: <span className="text-text-primary">{folder ? folderDisplayName(folder) : '…'}</span>
      </span>
      <Button variant="secondary" size="sm" onClick={onChange} disabled={disabled}>
        <FolderOpen className="w-4 h-4" />
        Change…
      </Button>
    </div>
  )
}
