import { getStatusText } from '../../domains/agents/templates'
import { cn } from '../../lib/format'
import type { AgentRuntimeStatus } from '../../domains/agents/types'

const badgeClassName: Record<AgentRuntimeStatus, string> = {
  running: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  creating: 'border-amber-200 bg-amber-50 text-amber-700',
  stopped: 'border-slate-200 bg-slate-100 text-slate-600',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
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
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium', badgeClassName[status])}>
      <span className={cn('mr-1.5 h-1.5 w-1.5 rounded-full', dotClassName[status])} />
      {getStatusText(status)}
    </span>
  )
}
