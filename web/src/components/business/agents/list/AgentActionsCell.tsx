import {
  Bot,
  Ellipsis,
  FolderOpen,
  PauseCircle,
  PlayCircle,
  Settings,
  Terminal,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AgentListItem } from '../../../../domains/agents/types'
import { cn } from '../../../../lib/format'
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

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [menuOpen])

  const primaryAction = canTerminal
    ? { label: '终端', icon: Terminal, onClick: () => onTerminal(item) }
    : canChat
      ? { label: '对话', icon: Bot, onClick: () => onChat(item) }
      : { label: '详情', icon: Settings, onClick: () => onOpenDetail(item) }

  const handlePrimaryAction = () => {
    primaryAction.onClick()
  }

  const menuItems = [
    {
      key: 'chat',
      label: '对话',
      icon: Bot,
      disabled: !canChat,
      title: canChat ? '打开对话' : item.chatDisabledReason || '当前模板或状态不支持对话',
      onClick: () => onChat(item),
    },
    {
      key: 'files',
      label: '文件',
      icon: FolderOpen,
      disabled: !canFiles,
      title: canFiles ? '打开文件管理' : '当前状态不可进入文件管理',
      onClick: () => onFiles(item),
    },
    {
      key: 'toggle',
      label: toggleTitle,
      icon: item.status === 'running' ? PauseCircle : PlayCircle,
      disabled: !canToggleState,
      title: toggleTitle,
      onClick: () => onToggleState(item),
    },
    {
      key: 'edit',
      label: '配置',
      icon: Settings,
      disabled: false,
      title: '配置',
      onClick: () => onEdit(item),
    },
    {
      key: 'delete',
      label: '删除',
      icon: Trash2,
      disabled: false,
      title: '删除',
      destructive: true,
      onClick: () => onDelete(item),
    },
  ]

  return (
    <div className="relative flex items-center justify-start gap-2" ref={menuRef}>
      <Button
        className="h-9 min-w-[88px] px-3 text-xs"
        onClick={handlePrimaryAction}
        title={primaryAction.label}
        type="button"
      >
        <primaryAction.icon size={15} />
        {primaryAction.label}
      </Button>
      <Button
        className="h-9 px-3 text-xs"
        onClick={() => onOpenDetail(item)}
        type="button"
        variant="secondary"
      >
        详情
      </Button>
      <Button
        aria-expanded={menuOpen}
        className="h-9 w-9 px-0"
        onClick={() => setMenuOpen((current) => !current)}
        title="更多操作"
        type="button"
        variant="ghost"
      >
        <Ellipsis size={16} />
      </Button>

      {menuOpen ? (
        <div className="absolute right-0 top-11 z-20 min-w-[160px] rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.24)]">
          {menuItems.map((menuItem) => {
            const Icon = menuItem.icon

            return (
              <button
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40',
                  menuItem.destructive ? 'hover:bg-rose-50 hover:text-rose-600' : '',
                )}
                disabled={menuItem.disabled}
                key={menuItem.key}
                onClick={() => {
                  menuItem.onClick()
                  setMenuOpen(false)
                }}
                title={menuItem.title}
                type="button"
              >
                <Icon size={15} />
                <span>{menuItem.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
