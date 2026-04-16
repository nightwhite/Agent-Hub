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
    <div className="flex min-w-0 items-center gap-3 pr-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
        <img
          alt={`${item.template.name} logo`}
          className="h-7 w-7 object-cover"
          src={item.template.logo}
        />
      </div>
      <div className="min-w-0 flex-1">
        <button
          className="block max-w-full truncate text-left text-sm font-semibold text-zinc-950 transition hover:text-[var(--color-brand)]"
          onClick={() => onOpenDetail(item)}
          type="button"
        >
          {item.aliasName || item.name}
        </button>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
          <span className="truncate font-mono">{item.name}</span>
          <span className="shrink-0">·</span>
          <span className="truncate">{item.template.name}</span>
        </div>
      </div>
    </div>
  )
}
