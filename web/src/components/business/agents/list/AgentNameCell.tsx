import type { AgentListItem } from '../../../../domains/agents/types'

interface AgentNameCellProps {
  item: AgentListItem
  onOpenDetail: (item: AgentListItem) => void
}

export function AgentNameCell({
  item,
  onOpenDetail,
}: AgentNameCellProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 pr-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
        <img
          alt={`${item.template.name} logo`}
          className="h-6 w-6 object-cover"
          src={item.template.logo}
        />
      </div>
      <div className="min-w-0 flex-1">
        <button
          className="max-w-full truncate text-left text-sm font-medium text-zinc-950 transition hover:text-[var(--color-brand)]"
          onClick={() => onOpenDetail(item)}
          type="button"
        >
          {item.aliasName || item.name}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="truncate font-mono">{item.name}</span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-600">
            {item.template.name}
          </span>
        </div>
      </div>
    </div>
  )
}
