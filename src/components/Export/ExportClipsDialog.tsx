// STUB: contract only. Implementation owned by the export-engine worker (W3).
export interface ExportClipsDialogProps {
  onClose: () => void
  /** The loaded video's local-video:// URL. */
  videoSrc: string
}

export default function ExportClipsDialog({ onClose }: ExportClipsDialogProps) {
  void onClose
  return null
}
