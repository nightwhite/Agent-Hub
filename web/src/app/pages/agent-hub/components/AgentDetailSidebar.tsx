import { Bot, FolderOpen, LayoutDashboard, Terminal } from 'lucide-react'
import { cn } from '../../../../lib/format'

export type AgentDetailTab = 'overview' | 'chat' | 'terminal' | 'files'

const TABS: Array<{
  value: AgentDetailTab
  label: string
  icon: typeof LayoutDashboard
}> = [
  { value: 'overview', label: '概览', icon: LayoutDashboard },
  { value: 'chat', label: '对话', icon: Bot },
  { value: 'terminal', label: '终端', icon: Terminal },
  { value: 'files', label: '文件', icon: FolderOpen },
]

interface AgentDetailSidebarProps {
  currentTab: AgentDetailTab
  onTabChange: (tab: AgentDetailTab) => void
}

export function AgentDetailSidebar({
  currentTab,
  onTabChange,
}: AgentDetailSidebarProps) {
  return (
    <aside className="rounded-xl border border-zinc-200 bg-white p-2 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
      <div className="flex gap-2 lg:flex-col">
        {TABS.map((tab) => {
          const Icon = tab.icon

          return (
            <button
              className={cn(
                'flex min-w-[74px] flex-1 flex-col items-center gap-1 rounded-lg px-2 py-3 text-center text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 lg:w-[74px] lg:flex-none',
                currentTab === tab.value && 'bg-zinc-100 text-zinc-950',
              )}
              key={tab.value}
              onClick={() => onTabChange(tab.value)}
              type="button"
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
