import { formatTime } from '../../../lib/format'
import type { AgentListItem } from '../../../domains/agents/types'
import { EmptyState } from '../../ui/EmptyState'
import { AgentActionsCell } from './list/AgentActionsCell'
import { AgentNameCell } from './list/AgentNameCell'
import { AgentResourcesCell } from './list/AgentResourcesCell'
import { AgentStatusCell } from './list/AgentStatusCell'

interface AgentInstancesTableProps {
  items: AgentListItem[]
  onCreate: () => void
  onOpenDetail: (item: AgentListItem) => void
  onChat: (item: AgentListItem) => void
  onFiles: (item: AgentListItem) => void
  onTerminal: (item: AgentListItem) => void
  onToggleState: (item: AgentListItem) => void
  onEdit: (item: AgentListItem) => void
  onDelete: (item: AgentListItem) => void
}

export function AgentInstancesTable({
  items,
  onCreate,
  onOpenDetail,
  onChat,
  onFiles,
  onTerminal,
  onToggleState,
  onEdit,
  onDelete,
}: AgentInstancesTableProps) {
  if (!items.length) {
    return (
      <EmptyState
        action={
          <button className="btn-primary" onClick={onCreate} type="button">
            创建 Agent
          </button>
        }
        description="当前还没有 Agent 实例。你可以从右上角开始创建，也可以直接从这里创建第一个实例。"
        title="暂无 Agent 实例"
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="flex min-h-full min-w-[1040px] flex-col gap-2">
          <div className="grid grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,1fr)_96px_280px] items-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-500 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
            <div>实例</div>
            <div>状态</div>
            <div>资源规格</div>
            <div>更新时间</div>
            <div className="text-right">操作</div>
          </div>

          {items.map((item) => (
            <div
              className="group grid grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,1fr)_96px_280px] items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] transition-colors hover:bg-zinc-50/60"
              key={item.id}
            >
              <AgentNameCell item={item} onOpenDetail={onOpenDetail} />
              <AgentStatusCell item={item} />
              <AgentResourcesCell item={item} />
              <div className="text-xs text-zinc-500">{formatTime(item.updatedAt)}</div>
              <AgentActionsCell
                item={item}
                onChat={onChat}
                onDelete={onDelete}
                onEdit={onEdit}
                onFiles={onFiles}
                onOpenDetail={onOpenDetail}
                onTerminal={onTerminal}
                onToggleState={onToggleState}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
