import { ArrowLeft, Bot, FolderOpen, PauseCircle, PlayCircle, Settings, Terminal, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AgentListItem } from '../../../../domains/agents/types'
import { Button } from '../../../../components/ui/Button'
import { StatusBadge } from '../../../../components/ui/StatusBadge'

interface AgentDetailHeaderProps {
  item: AgentListItem
  onBack: () => void
  onOpenTerminalWindow: () => void
  onDelete: () => void
  onOpenChat: () => void
  onOpenFiles: () => void
  onOpenConfig: () => void
  onToggleState: () => void
  extraActions?: ReactNode
}

export function AgentDetailHeader({
  item,
  onBack,
  onOpenTerminalWindow,
  onDelete,
  onOpenChat,
  onOpenFiles,
  onOpenConfig,
  onToggleState,
  extraActions,
}: AgentDetailHeaderProps) {
  const toggleLabel = item.status === 'running' ? '暂停' : '启动'

  return (
    <header className="flex min-h-20 w-full items-center justify-between gap-5">
      <div className="flex min-w-fit items-center">
        <button
          className="flex h-12 w-12 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          onClick={onBack}
          title="返回 Agent 列表"
          type="button"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="mr-3 min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="truncate text-xl font-semibold text-zinc-950">{item.aliasName || item.name}</div>
            <StatusBadge status={item.status} />
          </div>
          {item.aliasName ? (
            <div className="mt-0.5 truncate font-mono text-xs text-zinc-500">{item.name}</div>
          ) : null}
        </div>
      </div>

      <div className="flex h-10 items-center gap-3">
        {extraActions}

        <Button
          className="h-10 w-10 bg-white px-0 text-zinc-500 hover:text-zinc-900"
          disabled={!item.terminalAvailable}
          onClick={onOpenTerminalWindow}
          title={item.terminalAvailable ? '打开终端窗口' : item.terminalDisabledReason || '终端不可用'}
          type="button"
          variant="secondary"
        >
          <Terminal className="h-4 w-4" />
        </Button>

        <Button
          className="h-10 w-10 bg-white px-0 text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          onClick={onDelete}
          title="删除"
          type="button"
          variant="secondary"
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        <div className="flex items-center rounded-lg border-[0.5px] border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <Button
            className="h-10 rounded-r-none border-0 px-3 shadow-none"
            disabled={!item.chatAvailable}
            onClick={onOpenChat}
            title={item.chatAvailable ? '对话' : item.chatDisabledReason || '对话不可用'}
            type="button"
            variant="secondary"
          >
            <Bot className="h-4 w-4" />
            对话
          </Button>
          <Button
            className="h-10 rounded-none border-y-0 border-r-0 border-l border-zinc-200 px-3 shadow-none"
            onClick={onOpenFiles}
            title="文件"
            type="button"
            variant="secondary"
          >
            <FolderOpen className="h-4 w-4" />
            文件
          </Button>
          <Button
            className="h-10 rounded-none border-y-0 border-r-0 border-l border-zinc-200 px-3 shadow-none"
            onClick={onOpenConfig}
            title="配置"
            type="button"
            variant="secondary"
          >
            <Settings className="h-4 w-4" />
            配置
          </Button>
          <Button
            className="h-10 rounded-l-none border-y-0 border-r-0 border-l border-zinc-200 px-3 shadow-none"
            onClick={onToggleState}
            title={toggleLabel}
            type="button"
            variant="secondary"
          >
            {item.status === 'running' ? (
              <PauseCircle className="h-4 w-4" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            {toggleLabel}
          </Button>
        </div>
      </div>
    </header>
  )
}

