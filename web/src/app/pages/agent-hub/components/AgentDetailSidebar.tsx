import {
  Bot,
  FolderOpen,
  Globe,
  LayoutDashboard,
  Settings,
} from 'lucide-react'
import type {
  AgentListItem,
  AgentWorkspaceItem,
} from '../../../../domains/agents/types'
import { cn } from '../../../../lib/format'

export type AgentDetailTab = AgentWorkspaceItem['key']

interface AgentDetailSidebarProps {
  item: AgentListItem
  currentTab: AgentDetailTab
  onTabChange: (tab: AgentDetailTab) => void
}

export function AgentDetailSidebar({
  item,
  currentTab,
  onTabChange,
}: AgentDetailSidebarProps) {
  const iconMap = {
    overview: LayoutDashboard,
    chat: Bot,
    files: FolderOpen,
    settings: Settings,
    'web-ui': Globe,
  } as const;

  const tabs = item.workspaces
    .filter((workspace) => workspace.key !== 'terminal')
    .map((workspace) => ({
      value: workspace.key,
      label: workspace.label,
      icon: iconMap[workspace.key as keyof typeof iconMap] || LayoutDashboard,
      enabled: workspace.enabled,
      reason: workspace.reason || '',
    }));

  return (
    <aside className="flex h-full min-h-0 w-[56px] shrink-0 flex-col rounded-xl border-[0.5px] border-zinc-200 bg-white p-1.5 shadow-[0_1px_2px_rgba(24,24,27,0.04)] min-[1200px]:w-[78px]">
      <div className="flex min-h-0 flex-1 flex-col items-start gap-1 overflow-y-auto pr-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              className={cn(
                'flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg p-1.5 text-center text-[10px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 min-[1200px]:p-2 min-[1200px]:text-[11px]',
                currentTab === tab.value &&
                  'bg-zinc-100 text-zinc-900 shadow-[inset_0_0_0_0.5px_rgba(228,228,231,0.9)]',
                !tab.enabled &&
                  'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-zinc-500',
              )}
              key={tab.value}
              onClick={() => {
                if (!tab.enabled) return
                onTabChange(tab.value)
              }}
              title={tab.enabled ? tab.label : tab.reason}
              type="button"
            >
              <Icon size={18} strokeWidth={1.35} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
