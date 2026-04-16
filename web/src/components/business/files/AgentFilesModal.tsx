import type { AgentFileItem, FilesSessionState } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { AgentFilesWorkspace } from './AgentFilesWorkspace'

interface AgentFilesModalProps {
  open: boolean
  session: FilesSessionState | null
  onClose: () => void
  onOpenEntry: (item: AgentFileItem) => void
  onOpenParent: () => void
  onRefresh: () => void
  onChangeContent: (value: string) => void
  onSave: () => void
  onDownload: (path: string) => void
  onDelete: (path: string) => void
  onCreateDirectory: (name: string) => void
  onCreateFile: (name: string) => void
  onUpload: (files: FileList | File[]) => void
}

export function AgentFilesModal({
  open,
  session,
  onClose,
  onOpenEntry,
  onOpenParent,
  onRefresh,
  onChangeContent,
  onSave,
  onDownload,
  onDelete,
  onCreateDirectory,
  onCreateFile,
  onUpload,
}: AgentFilesModalProps) {
  const displayName = session?.resource.aliasName || session?.resource.name || '--'

  return (
    <Modal
      description="管理 Agent 安装目录中的文件。当前后端文件操作根目录固定为 /opt/hermes。"
      footer={
        <Button onClick={onClose} variant="secondary">
          关闭
        </Button>
      }
      onClose={onClose}
      open={open}
      title={`文件管理 · ${displayName}`}
      widthClassName="max-w-7xl"
    >
      <AgentFilesWorkspace
        onChangeContent={onChangeContent}
        onCreateDirectory={onCreateDirectory}
        onCreateFile={onCreateFile}
        onDelete={onDelete}
        onDownload={onDownload}
        onOpenEntry={onOpenEntry}
        onOpenParent={onOpenParent}
        onRefresh={onRefresh}
        onSave={onSave}
        onUpload={onUpload}
        session={session}
      />
    </Modal>
  )
}
