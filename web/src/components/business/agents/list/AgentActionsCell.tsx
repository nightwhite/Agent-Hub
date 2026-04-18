import {
  Bot,
  Ellipsis,
  FolderOpen,
  Globe,
  PauseCircle,
  PlayCircle,
  Settings,
  Terminal,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getAccessItem, getActionItem } from '../../../../domains/agents/mappers'
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
  onWebUI: (item: AgentListItem) => void
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
  onWebUI,
}: AgentActionsCellProps) {
  const chatAction = getActionItem(item, 'open-chat')
  const terminalAction = getActionItem(item, 'open-terminal')
  const filesAction = getActionItem(item, 'open-files')
  const settingsAction = getActionItem(item, 'open-settings')
  const runAction = getActionItem(item, 'run')
  const pauseAction = getActionItem(item, 'pause')
  const deleteAction = getActionItem(item, 'delete')
  const webUIAccess = getAccessItem(item, 'web-ui')

  const canChat = Boolean(chatAction?.enabled && item.chatAvailable)
  const canFiles = Boolean(filesAction?.enabled && getAccessItem(item, 'files')?.enabled)
  const canTerminal = Boolean(terminalAction?.enabled && item.terminalAvailable)
  const canWebUI = Boolean(webUIAccess?.enabled)
  const canToggleState = Boolean(runAction?.enabled || pauseAction?.enabled)
  const toggleTitle = pauseAction?.enabled ? pauseAction.label : runAction?.enabled ? runAction.label : '当前状态不可切换'

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, transformOrigin: 'top right' })

  const updateMenuPosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return

    const triggerRect = trigger.getBoundingClientRect()
    const menuWidth = menuRef.current?.offsetWidth || 188
    const menuHeight = menuRef.current?.offsetHeight || 240
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const edgePadding = 12
    const gap = 8

    const left = Math.min(
      Math.max(edgePadding, triggerRect.right - menuWidth),
      viewportWidth - menuWidth - edgePadding,
    )

    const canOpenBelow = triggerRect.bottom + gap + menuHeight <= viewportHeight - edgePadding
    const top = canOpenBelow
      ? triggerRect.bottom + gap
      : Math.max(edgePadding, triggerRect.top - menuHeight - gap)

    setMenuPosition({
      top,
      left,
      transformOrigin: canOpenBelow ? 'top right' : 'bottom right',
    })
  }

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    const frame = window.requestAnimationFrame(updateMenuPosition)

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [menuOpen])

  const primaryAction = canTerminal
    ? { label: '终端', icon: Terminal, onClick: () => onTerminal(item) }
    : canChat
      ? { label: '对话', icon: Bot, onClick: () => onChat(item) }
      : canWebUI
        ? { label: 'Web UI', icon: Globe, onClick: () => onWebUI(item) }
        : { label: '详情', icon: Settings, onClick: () => onOpenDetail(item) }

  const showDetailShortcut = primaryAction.label !== '详情'

  const menuItems = [
    chatAction || getAccessItem(item, 'api')
      ? {
      key: 'chat',
      label: '对话',
      icon: Bot,
      disabled: !canChat,
      title: chatAction?.reason || item.chatDisabledReason || '当前模板或状态不支持对话',
      onClick: () => onChat(item),
    }
      : null,
    terminalAction || getAccessItem(item, 'terminal')
      ? {
      key: 'terminal',
      label: '终端',
      icon: Terminal,
      disabled: !canTerminal,
      title: terminalAction?.reason || item.terminalDisabledReason || '当前状态不可进入终端',
      onClick: () => onTerminal(item),
    }
      : null,
    filesAction || getAccessItem(item, 'files')
      ? {
      key: 'files',
      label: '文件',
      icon: FolderOpen,
      disabled: !canFiles,
      title: filesAction?.reason || '当前状态不可进入文件管理',
      onClick: () => onFiles(item),
    }
      : null,
    webUIAccess
      ? {
      key: 'web-ui',
      label: 'Web UI',
      icon: Globe,
      disabled: !canWebUI,
      title: webUIAccess?.reason || '当前模板不提供 Web UI',
      onClick: () => onWebUI(item),
    }
      : null,
    runAction || pauseAction
      ? {
      key: 'toggle',
      label: toggleTitle,
      icon: pauseAction?.enabled ? PauseCircle : PlayCircle,
      disabled: !canToggleState,
      title: pauseAction?.reason || runAction?.reason || toggleTitle,
      onClick: () => onToggleState(item),
    }
      : null,
    settingsAction
      ? {
      key: 'edit',
      label: '配置',
      icon: Settings,
      disabled: !settingsAction?.enabled,
      title: settingsAction?.reason || '配置',
      onClick: () => onEdit(item),
    }
      : null,
    deleteAction
      ? {
      key: 'delete',
      label: '删除',
      icon: Trash2,
      disabled: !deleteAction?.enabled,
      title: deleteAction?.reason || '删除',
      destructive: true,
      onClick: () => onDelete(item),
    }
      : null,
  ].filter((menuItem): menuItem is NonNullable<typeof menuItem> => Boolean(menuItem))

  return (
    <div className="relative flex items-center justify-end gap-1">
      <Button
        className="h-8 min-w-[70px] rounded-lg px-2.5 shadow-none"
        onClick={primaryAction.onClick}
        size="sm"
        title={primaryAction.label}
        type="button"
        variant="secondary"
      >
        <primaryAction.icon size={15} />
        {primaryAction.label}
      </Button>
      {showDetailShortcut ? (
        <Button
          className="h-8 rounded-lg px-2.5 text-zinc-600 shadow-none"
          onClick={() => onOpenDetail(item)}
          size="sm"
          type="button"
          variant="ghost"
        >
          详情
        </Button>
      ) : null}
      <div ref={triggerRef}>
        <Button
          aria-expanded={menuOpen}
          className="h-8 w-8 rounded-lg px-0 text-zinc-500"
          onClick={() => setMenuOpen((current) => !current)}
          size="sm"
          title="更多操作"
          type="button"
          variant="ghost"
        >
          <Ellipsis size={16} />
        </Button>
      </div>

      {menuOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-50 min-w-[188px] rounded-xl border-[0.5px] border-zinc-200 bg-white p-1.5 shadow-[0_12px_32px_-14px_rgba(24,24,27,0.24)]"
              ref={menuRef}
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                transformOrigin: menuPosition.transformOrigin,
              }}
            >
              {menuItems.map((menuItem) => {
                const Icon = menuItem.icon

                return (
                  <button
                    className={cn(
                      'flex h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-[13px]/5 text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40',
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
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
