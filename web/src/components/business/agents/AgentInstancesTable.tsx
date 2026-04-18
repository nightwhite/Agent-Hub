import { formatTime } from '../../../lib/format'
import type { AgentListItem } from '../../../domains/agents/types'
import { AgentActionsCell } from './list/AgentActionsCell'
import { AgentNameCell } from './list/AgentNameCell'
import { AgentResourcesCell } from './list/AgentResourcesCell'
import { AgentStatusCell } from './list/AgentStatusCell'

interface AgentInstancesTableProps {
  items: AgentListItem[]
  onOpenDetail: (item: AgentListItem) => void
  onChat: (item: AgentListItem) => void
  onFiles: (item: AgentListItem) => void
  onTerminal: (item: AgentListItem) => void
  onWebUI: (item: AgentListItem) => void
  onToggleState: (item: AgentListItem) => void
  onEdit: (item: AgentListItem) => void
  onDelete: (item: AgentListItem) => void
}

export function AgentInstancesTable({
  items,
  onOpenDetail,
  onChat,
  onFiles,
  onTerminal,
  onWebUI,
  onToggleState,
  onEdit,
  onDelete,
}: AgentInstancesTableProps) {
  const tableGridClassName =
    'grid min-w-0 grid-cols-[minmax(0,1.45fr)_minmax(0,0.72fr)_minmax(0,1fr)_minmax(0,0.78fr)_minmax(0,1.05fr)] items-center gap-2'

  if (!items.length) {
    return null
  }

  return (
    <section className="flex min-h-[320px] flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden">
        <div className="flex min-h-full min-w-0 flex-col gap-3">
          <div className="sticky top-0 z-10 rounded-lg border-[0.5px] border-zinc-200 bg-white px-6 py-2 text-sm/5 text-zinc-500 shadow-[0px_2px_8px_-2px_rgba(0,0,0,0.08)]">
            <div className={tableGridClassName}>
              <div className="min-w-0 truncate pr-2">实例</div>
              <div className="min-w-0 truncate pr-2">状态</div>
              <div className="min-w-0 truncate pr-2">资源规格</div>
              <div className="min-w-0 truncate pr-2">更新时间</div>
              <div className="min-w-0 truncate text-right">操作</div>
            </div>
          </div>

          {items.map((item) => (
            <div
              className={`${tableGridClassName} group min-h-16 rounded-xl border-[0.5px] border-zinc-200 bg-white px-6 py-2 transition-colors hover:bg-zinc-50`}
              key={item.id}
            >
              <div className="min-w-0">
                <AgentNameCell item={item} onOpenDetail={onOpenDetail} />
              </div>
              <div className="min-w-0">
                <AgentStatusCell item={item} />
              </div>
              <div className="min-w-0">
                <AgentResourcesCell item={item} />
              </div>
              <div className="min-w-0 truncate pr-2 text-[13px]/5 tabular-nums text-zinc-500">
                {formatTime(item.updatedAt)}
              </div>
              <div className="min-w-0">
                <AgentActionsCell
                  item={item}
                  onChat={onChat}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onFiles={onFiles}
                  onOpenDetail={onOpenDetail}
                  onTerminal={onTerminal}
                  onToggleState={onToggleState}
                  onWebUI={onWebUI}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
