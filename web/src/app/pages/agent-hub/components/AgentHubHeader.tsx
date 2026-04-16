import { LayoutTemplate, Plus } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'
import { SearchField } from '../../../../components/ui/SearchField'

interface AgentHubHeaderProps {
  keyword: string
  operator: string
  namespace?: string
  onBrowseTemplates?: () => void
  onCreate: () => void
  onKeywordChange: (value: string) => void
}

export function AgentHubHeader({
  keyword,
  operator,
  namespace,
  onBrowseTemplates,
  onCreate,
  onKeywordChange,
}: AgentHubHeaderProps) {
  return (
    <header className="flex h-24 w-full flex-shrink-0 items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        <div className="text-2xl/8 font-semibold tracking-[-0.02em] text-zinc-950">Agent Hub</div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="shrink-0">{operator} Workspace</span>
          {namespace ? <span className="truncate font-mono">{namespace}</span> : null}
        </div>
      </div>

      <div className="flex items-center gap-3 !overflow-visible">
        <SearchField
          className="w-64"
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="搜索别名或实例名"
          value={keyword}
        />
        {onBrowseTemplates ? (
          <Button onClick={onBrowseTemplates} variant="secondary">
            <LayoutTemplate size={16} />
            模板市场
          </Button>
        ) : null}
        <Button leading={<Plus size={16} />} onClick={onCreate}>
          创建 Agent
        </Button>
      </div>
    </header>
  )
}
