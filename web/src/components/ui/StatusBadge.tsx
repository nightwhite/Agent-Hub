import { getStatusText } from '../../domains/agents/templates'
import { cn } from '../../lib/format'
import type { AgentRuntimeStatus } from '../../domains/agents/types'

const badgeClassName: Record<AgentRuntimeStatus, string> = {
  running: 'border-emerald-200 bg-emerald-50/80 text-emerald-700',
  creating: 'border-amber-200 bg-amber-50/80 text-amber-700',
  stopped: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  error: 'border-rose-200 bg-rose-50/80 text-rose-700',
}

const dotClassName: Record<AgentRuntimeStatus, string> = {
  running: 'bg-emerald-500',
  creating: 'bg-amber-500',
  stopped: 'bg-zinc-400',
  error: 'bg-rose-500',
}

interface StatusBadgeProps {
  status: AgentRuntimeStatus
  compact?: boolean
}

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        compact
          ? 'inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2 text-[11px]/4 font-medium'
          : 'inline-flex min-h-7 items-center gap-2 rounded-md border px-2.5 text-xs/4 font-medium',
        badgeClassName[status],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClassName[status])} />
      {getStatusText(status)}
    </span>
  )
}
