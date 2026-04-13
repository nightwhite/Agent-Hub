import type { RefObject } from 'react'
import type { TerminalSessionState } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'

interface AgentTerminalModalProps {
  open: boolean
  session: TerminalSessionState | null
  containerRef: RefObject<HTMLDivElement | null>
  onClose: () => void
}

export function AgentTerminalModal({
  open,
  session,
  containerRef,
  onClose,
}: AgentTerminalModalProps) {
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
      title={`终端 · ${session?.resource.name || '--'}`}
      widthClassName="max-w-5xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">状态: {session?.status || '--'}</span>
          {session?.podName ? <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Pod: {session.podName}</span> : null}
          {session?.containerName ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">容器: {session.containerName}</span>
          ) : null}
        </div>
        {session?.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {session.error}
          </div>
        ) : null}
        <div className="overflow-hidden rounded-[24px] border border-slate-900 bg-[#05070a] p-3">
          <div className="h-[520px] w-full" ref={containerRef} />
        </div>
      </div>
    </Modal>
  )
}
