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
    <div className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700">
      <span className="text-zinc-500">{icon}</span>
      <span className="text-zinc-500">{label}</span>
      <span className="ml-auto font-medium text-zinc-950">{value}</span>
    </div>
  )
}

interface AgentResourcesCellProps {
  item: AgentListItem
}

export function AgentResourcesCell({ item }: AgentResourcesCellProps) {
  return (
    <div className="grid gap-1.5">
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
