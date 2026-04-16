import type { TerminalSessionState } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { AgentTerminalWorkspace } from './AgentTerminalWorkspace'

interface AgentTerminalModalProps {
  open: boolean
  session: TerminalSessionState | null
  onClose: () => void
  onError?: (message: string) => void
  onReady?: () => void
  onAttachOutput?: (listener: (chunk: string) => void) => () => void
  onInput?: (input: string) => void
  onResize?: (cols: number, rows: number) => void
}

export function AgentTerminalModal({
  open,
  session,
  onClose,
  onError,
  onReady,
  onAttachOutput,
  onInput,
  onResize,
}: AgentTerminalModalProps) {
  const displayName = session?.resource.aliasName || session?.resource.name || '--'

  return (
    <Modal
      description="直接进入容器环境，检查进程、日志和 CLI 状态。"
      footer={
        <Button onClick={onClose} variant="secondary">
          关闭
        </Button>
      }
      onClose={onClose}
      open={open}
      title={`终端 · ${displayName}`}
      widthClassName="max-w-6xl"
    >
      <AgentTerminalWorkspace
        onAttachOutput={onAttachOutput}
        onError={onError}
        onInput={onInput}
        onReady={onReady}
        onResize={onResize}
        session={session}
      />
    </Modal>
  )
}
