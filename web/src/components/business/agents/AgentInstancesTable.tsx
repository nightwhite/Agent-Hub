import { formatTime } from '../../../lib/format'
import type { AgentListItem } from '../../../domains/agents/types'
import { EmptyState } from '../../ui/EmptyState'
import { Button } from '../../ui/Button'
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
  const tableMinWidth = 1180
  const colWidth = {
    name: 360,
    status: 170,
    resources: 330,
    updatedAt: 140,
    actions: 280,
  } as const

  if (!items.length) {
    return (
      <EmptyState
        action={
          <Button onClick={onCreate} type="button">
            创建 Agent
          </Button>
        }
        description="当前还没有 Agent 实例。你可以从右上角开始创建，也可以直接从这里创建第一个实例。"
        title="暂无 Agent 实例"
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col justify-between">
      <div className="flex min-h-0 flex-col gap-3 overflow-x-auto">
        <div
          className="flex h-10 items-center rounded-lg border-[0.5px] border-zinc-200 bg-white px-6 py-1 text-sm/5 text-zinc-500 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]"
          style={{ minWidth: tableMinWidth }}
        >
          <div className="flex-shrink-0" style={{ width: colWidth.name }}>
            实例
          </div>
          <div className="flex-shrink-0" style={{ width: colWidth.status }}>
            状态
          </div>
          <div className="flex-shrink-0" style={{ width: colWidth.resources }}>
            资源规格
          </div>
          <div className="flex-shrink-0" style={{ width: colWidth.updatedAt }}>
            更新时间
          </div>
          <div className="flex-shrink-0 text-right" style={{ width: colWidth.actions }}>
            操作
          </div>
        </div>

        {items.map((item) => (
          <div
            className="group flex h-16 items-center rounded-xl border-[0.5px] border-zinc-200 bg-white px-6 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] transition-colors hover:bg-zinc-50/80"
            key={item.id}
            style={{ minWidth: tableMinWidth }}
          >
            <div className="flex-shrink-0" style={{ width: colWidth.name }}>
              <AgentNameCell item={item} onOpenDetail={onOpenDetail} />
            </div>
            <div className="flex-shrink-0" style={{ width: colWidth.status }}>
              <AgentStatusCell item={item} />
            </div>
            <div className="flex-shrink-0" style={{ width: colWidth.resources }}>
              <AgentResourcesCell item={item} />
            </div>
            <div className="flex-shrink-0 text-xs text-zinc-500" style={{ width: colWidth.updatedAt }}>
              {formatTime(item.updatedAt)}
            </div>
            <div className="flex-shrink-0" style={{ width: colWidth.actions }}>
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
          </div>
        ))}
      </div>
    </div>
  )
}
