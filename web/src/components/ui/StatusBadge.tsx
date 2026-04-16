import { getStatusText } from '../../domains/agents/templates'
import { cn } from '../../lib/format'
import type { AgentRuntimeStatus } from '../../domains/agents/types'

const textClassName: Record<AgentRuntimeStatus, string> = {
  running: 'text-zinc-900',
  creating: 'text-zinc-900',
  stopped: 'text-zinc-900',
  error: 'text-zinc-900',
}

const dotClassName: Record<AgentRuntimeStatus, string> = {
  running: 'bg-emerald-500',
  creating: 'bg-amber-500',
  stopped: 'bg-slate-400',
  error: 'bg-rose-500',
}

interface StatusBadgeProps {
  status: AgentRuntimeStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm font-medium', textClassName[status])}>
      <span className={cn('h-2 w-2 rounded-[4px]', dotClassName[status])} />
      {getStatusText(status)}
    </span>
  )
}
