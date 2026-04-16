import { Cpu, Database, HardDrive } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AgentListItem } from '../../../../domains/agents/types'
import { formatCpu, formatMemory, formatStorage } from '../../../../lib/format'

function ResourcePill({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-700">
      <span className="text-zinc-500">{icon}</span>
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-950">{value}</span>
    </div>
  )
}

interface AgentResourcesCellProps {
  item: AgentListItem
}

export function AgentResourcesCell({ item }: AgentResourcesCellProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 pr-3">
      <ResourcePill icon={<Cpu size={14} />} label="CPU" value={formatCpu(item.cpu)} />
      <ResourcePill
        icon={<Database size={14} />}
        label="内存"
        value={formatMemory(item.memory)}
      />
      <ResourcePill
        icon={<HardDrive size={14} />}
        label="存储"
        value={formatStorage(item.storage)}
      />
    </div>
  )
}
