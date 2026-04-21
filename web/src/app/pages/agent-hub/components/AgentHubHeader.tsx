import { BookOpen, LayoutTemplate, Plus } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'
import { SearchField } from '../../../../components/ui/SearchField'
import { APP_NAME } from '../../../../branding'

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
  const workspaceLabel = namespace ? `工作区 ${namespace}` : `${operator} 工作区`

  return (
    <header className="flex w-full flex-shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2.5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="truncate text-[1.35rem]/8 font-semibold tracking-[-0.02em] text-zinc-950">
          {APP_NAME}
        </div>
        <div className="hidden min-w-0 items-center gap-2 text-blue-600 sm:flex">
          <BookOpen className="h-4 w-4 shrink-0" />
          <span className="truncate text-[12px]/5 font-medium">{workspaceLabel}</span>
        </div>
      </div>

      <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 !overflow-visible sm:w-auto sm:flex-nowrap sm:gap-3">
        <SearchField
          className="min-w-[180px] flex-1 sm:w-60 sm:flex-none"
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="搜索别名或实例名"
          size="sm"
          value={keyword}
        />
        {onBrowseTemplates ? (
          <Button onClick={onBrowseTemplates} size="sm" variant="secondary">
            <LayoutTemplate className="h-4 w-4" />
            浏览模板
          </Button>
        ) : null}
        <Button leading={<Plus className="h-4 w-4" />} onClick={onCreate} size="sm">
          创建 Agent
        </Button>
      </div>
    </header>
  )
}
