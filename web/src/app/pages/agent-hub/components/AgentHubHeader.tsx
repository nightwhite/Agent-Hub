import { Plus } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'
import { SearchField } from '../../../../components/ui/SearchField'

interface AgentHubHeaderProps {
  keyword: string
  operator: string
  namespace?: string
  onCreate: () => void
  onKeywordChange: (value: string) => void
}

export function AgentHubHeader({
  keyword,
  operator,
  namespace,
  onCreate,
  onKeywordChange,
}: AgentHubHeaderProps) {
  return (
    <header className="flex h-20 w-full flex-shrink-0 items-center justify-between gap-4 border-b border-zinc-200">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-xl font-semibold text-zinc-950">Agent Hub</span>
        <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600">
          Workspace: {operator}
        </span>
        {namespace ? (
          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-mono text-[11px] text-zinc-600">
            {namespace}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
          <SearchField
            className="w-56"
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="搜索别名或实例名"
            value={keyword}
          />
          <Button leading={<Plus size={16} />} onClick={onCreate}>
            创建 Agent
          </Button>
      </div>
    </header>
  )
}
