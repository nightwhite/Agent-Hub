import {
  Bot,
  Globe,
  PauseCircle,
  PlayCircle,
  Settings,
  Terminal,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../../../../components/ui/Button'
import type { AgentListItem } from '../../../../domains/agents/types'

interface AgentDetailHeaderProps {
  item: AgentListItem
  onOpenTerminalWindow: () => void
  onDelete: () => void
  onOpenChat: () => void
  onOpenConfig: () => void
  onOpenWebUI: () => void
  onToggleState: () => void
  extraActions?: ReactNode
}

export function AgentDetailHeader({
  item,
  onOpenTerminalWindow,
  onDelete,
  onOpenChat,
  onOpenConfig,
  onOpenWebUI,
  onToggleState,
  extraActions,
}: AgentDetailHeaderProps) {
  const toggleLabel = item.status === 'running' ? '暂停' : '启动'
  const toggleDisabled = item.status === 'creating'
  const toggleTitle = toggleDisabled ? '实例创建中，暂时不可切换状态' : toggleLabel
  const primaryAction = item.chatAvailable
    ? {
        label: '对话',
        icon: Bot,
        onClick: onOpenChat,
        disabled: false,
        title: '对话',
      }
    : item.webUIAvailable
      ? {
          label: 'Web UI',
          icon: Globe,
          onClick: onOpenWebUI,
          disabled: false,
          title: '打开 Web UI 工作台',
        }
      : item.terminalAvailable
        ? {
            label: '终端',
            icon: Terminal,
            onClick: onOpenTerminalWindow,
            disabled: false,
            title: '打开终端窗口',
          }
        : {
            label: '设置',
            icon: Settings,
            onClick: onOpenConfig,
            disabled: false,
            title: '打开设置',
          }

  return (
    <header className="flex w-full flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[#f7f9fd]">
            <img
              alt={`${item.template.name} logo`}
              className="h-9 w-9 object-cover"
              src={item.template.logo}
            />
          </div>
          <div className="truncate text-[28px]/8 font-extrabold tracking-[-0.03em] text-[#151b2d]">
            {item.aliasName || item.name}
          </div>
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 lg:w-auto lg:flex-nowrap lg:justify-end">
        {extraActions}

        <Button
          className="h-10 w-10 rounded-[10px] border-[#fecaca] bg-[#fff1f2] px-0 text-[#dc2626] shadow-none hover:bg-[#ffe4e6]"
          onClick={onDelete}
          size="md"
          title="删除"
          type="button"
          variant="secondary"
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        <Button
          className="h-10 w-10 rounded-[10px] bg-white px-0 text-[#5e6b80] shadow-none hover:text-[var(--color-brand)]"
          disabled={!item.terminalAvailable}
          onClick={onOpenTerminalWindow}
          size="md"
          title={item.terminalAvailable ? '打开终端窗口' : item.terminalDisabledReason || '终端不可用'}
          type="button"
          variant="secondary"
        >
          <Terminal className="h-4 w-4" />
        </Button>

        <div className="flex items-center overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-white shadow-none">
          <Button
            className="h-10 min-w-[88px] rounded-none border-0 px-4 text-[14px] leading-5 shadow-none"
            disabled={toggleDisabled}
            onClick={onToggleState}
            size="md"
            title={toggleTitle}
            type="button"
            variant="secondary"
          >
            {item.status === 'running' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {toggleLabel}
          </Button>
          <Button
            className="h-10 min-w-[88px] rounded-none border-0 border-l border-[var(--color-border)] px-4 text-[14px] leading-5 shadow-none"
            onClick={onOpenConfig}
            size="md"
            title="配置"
            type="button"
            variant="secondary"
          >
            <Settings className="h-4 w-4" />
            配置
          </Button>
        </div>

        <Button
          className="h-10 min-w-[88px] rounded-[10px] px-4 text-[14px] leading-5 font-semibold text-white"
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
          size="md"
          title={primaryAction.title}
          type="button"
          variant="primary"
        >
          <primaryAction.icon className="h-4 w-4" />
          {primaryAction.label}
        </Button>
      </div>
    </header>
  )
}
