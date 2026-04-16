import {
  Bot,
  FolderOpen,
  PauseCircle,
  PlayCircle,
  Settings,
  Terminal,
  Trash2,
} from 'lucide-react'
import type { AgentListItem } from '../../../../domains/agents/types'
import { Button } from '../../../ui/Button'

interface AgentActionsCellProps {
  item: AgentListItem
  onOpenDetail: (item: AgentListItem) => void
  onChat: (item: AgentListItem) => void
  onFiles: (item: AgentListItem) => void
  onTerminal: (item: AgentListItem) => void
  onToggleState: (item: AgentListItem) => void
  onEdit: (item: AgentListItem) => void
  onDelete: (item: AgentListItem) => void
}

export function AgentActionsCell({
  item,
  onOpenDetail,
  onChat,
  onFiles,
  onTerminal,
  onToggleState,
  onEdit,
  onDelete,
}: AgentActionsCellProps) {
  const canChat =
    item.template.capabilities.includes('chat') &&
    item.status === 'running' &&
    item.chatAvailable
  const canFiles = item.template.capabilities.includes('files') && item.status === 'running'
  const canTerminal =
    item.template.capabilities.includes('terminal') &&
    item.status === 'running' &&
    item.terminalAvailable
  const canToggleState = item.status === 'running' || item.status === 'stopped'
  const toggleTitle =
    item.status === 'running'
      ? '暂停'
      : item.status === 'stopped'
        ? '启动'
        : '当前状态不可切换运行态'

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        className="h-8 px-2.5 text-xs"
        onClick={() => onOpenDetail(item)}
        type="button"
        variant="secondary"
      >
        详情
      </Button>
      <Button
        className="h-8 w-8 px-0"
        disabled={!canChat}
        onClick={() => onChat(item)}
        title={canChat ? '对话' : item.chatDisabledReason || '当前模板或状态不支持对话'}
        type="button"
        variant="ghost"
      >
        <Bot size={16} />
      </Button>
      <Button
        className="h-8 w-8 px-0"
        disabled={!canFiles}
        onClick={() => onFiles(item)}
        title={canFiles ? '文件管理' : '当前状态不可进入文件管理'}
        type="button"
        variant="ghost"
      >
        <FolderOpen size={16} />
      </Button>
      <Button
        className="h-8 w-8 px-0"
        disabled={!canTerminal}
        onClick={() => onTerminal(item)}
        title={canTerminal ? '终端' : item.terminalDisabledReason || '当前状态不可进入终端'}
        type="button"
        variant="ghost"
      >
        <Terminal size={16} />
      </Button>
      <Button
        className="h-8 w-8 px-0"
        disabled={!canToggleState}
        onClick={() => onToggleState(item)}
        title={toggleTitle}
        type="button"
        variant="ghost"
      >
        {item.status === 'running' ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
      </Button>
      <Button
        className="h-8 w-8 px-0"
        onClick={() => onEdit(item)}
        title="配置"
        type="button"
        variant="ghost"
      >
        <Settings size={16} />
      </Button>
      <Button
        className="h-8 w-8 px-0 hover:bg-rose-50 hover:text-rose-600"
        onClick={() => onDelete(item)}
        title="删除"
        type="button"
        variant="ghost"
      >
        <Trash2 size={16} />
      </Button>
    </div>
  )
}
