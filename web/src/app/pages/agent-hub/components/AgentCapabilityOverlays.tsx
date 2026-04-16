import type {
  AgentFileItem,
  ChatSessionState,
  FilesSessionState,
  TerminalSessionState,
} from '../../../../domains/agents/types'
import { AgentChatModal } from '../../../../components/business/chat/AgentChatModal'
import { AgentFilesModal } from '../../../../components/business/files/AgentFilesModal'
import { AgentTerminalModal } from '../../../../components/business/terminal/AgentTerminalModal'

interface AgentCapabilityOverlaysProps {
  chatSession: ChatSessionState | null
  onCloseChat: () => void
  onChatDraftChange: (value: string) => void
  onSendChat: () => void
  terminalSession: TerminalSessionState | null
  onCloseTerminal: () => void
  onTerminalError?: (message: string) => void
  onTerminalReady?: () => void
  onTerminalAttachOutput?: (listener: (chunk: string) => void) => () => void
  onTerminalInput?: (input: string) => void
  onTerminalResize?: (cols: number, rows: number) => void
  filesSession: FilesSessionState | null
  onCloseFiles: () => void
  onChangeFileContent: (value: string) => void
  onCreateDirectory: (name: string) => void
  onCreateFile: (name: string) => void
  onDeleteFile: (path: string) => void
  onDownloadFile: (path: string) => void
  onOpenFileEntry: (item: AgentFileItem) => void
  onOpenParentDirectory: () => void
  onRefreshFiles: () => void
  onSaveFile: () => void
  onUploadFiles: (files: FileList | File[]) => void
}

export function AgentCapabilityOverlays({
  chatSession,
  onCloseChat,
  onChatDraftChange,
  onSendChat,
  terminalSession,
  onCloseTerminal,
  onTerminalError,
  onTerminalReady,
  onTerminalAttachOutput,
  onTerminalInput,
  onTerminalResize,
  filesSession,
  onCloseFiles,
  onChangeFileContent,
  onCreateDirectory,
  onCreateFile,
  onDeleteFile,
  onDownloadFile,
  onOpenFileEntry,
  onOpenParentDirectory,
  onRefreshFiles,
  onSaveFile,
  onUploadFiles,
}: AgentCapabilityOverlaysProps) {
  return (
    <>
      <AgentChatModal
        onClose={onCloseChat}
        onDraftChange={onChatDraftChange}
        onSend={onSendChat}
        open={Boolean(chatSession)}
        session={chatSession}
      />

      <AgentTerminalModal
        onAttachOutput={onTerminalAttachOutput}
        onClose={onCloseTerminal}
        onError={onTerminalError}
        onInput={onTerminalInput}
        onReady={onTerminalReady}
        onResize={onTerminalResize}
        open={Boolean(terminalSession)}
        session={terminalSession}
      />

      <AgentFilesModal
        onChangeContent={onChangeFileContent}
        onClose={onCloseFiles}
        onCreateDirectory={onCreateDirectory}
        onCreateFile={onCreateFile}
        onDelete={onDeleteFile}
        onDownload={onDownloadFile}
        onOpenEntry={onOpenFileEntry}
        onOpenParent={onOpenParentDirectory}
        onRefresh={onRefreshFiles}
        onSave={onSaveFile}
        onUpload={onUploadFiles}
        open={Boolean(filesSession)}
        session={filesSession}
      />
    </>
  )
}
