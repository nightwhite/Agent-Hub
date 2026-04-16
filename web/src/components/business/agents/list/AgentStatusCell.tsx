import type { AgentListItem } from '../../../../domains/agents/types'
import { StatusBadge } from '../../../ui/StatusBadge'

interface AgentStatusCellProps {
  item: AgentListItem
}

export function AgentStatusCell({ item }: AgentStatusCellProps) {
  return (
    <div className="min-w-0 pr-3">
      <StatusBadge status={item.status} />
      {item.bootstrapMessage && item.status === 'creating' ? (
        <div className="mt-1 line-clamp-1 text-[11px] leading-4 text-zinc-500">
          {item.bootstrapMessage}
        </div>
      ) : null}
    </div>
  )
}
