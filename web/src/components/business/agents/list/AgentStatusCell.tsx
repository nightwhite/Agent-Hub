import type { AgentListItem } from '../../../../domains/agents/types'
import { StatusBadge } from '../../../ui/StatusBadge'

interface AgentStatusCellProps {
  item: AgentListItem
}

export function AgentStatusCell({ item }: AgentStatusCellProps) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 pr-3">
      <StatusBadge compact status={item.status} />
      {item.bootstrapMessage && item.status === 'creating' ? (
        <div className="line-clamp-1 text-[11px]/4 text-zinc-500">
          {item.bootstrapMessage}
        </div>
      ) : null}
    </div>
  )
}
