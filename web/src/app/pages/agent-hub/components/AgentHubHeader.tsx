import { LayoutTemplate, Plus } from 'lucide-react'
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
  onBrowseTemplates,
  onCreate,
  onKeywordChange,
}: AgentHubHeaderProps) {
  return (
    <header className="flex flex-shrink-0 flex-col bg-[#fafafa] px-6 py-8 lg:px-12">
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-[24px]/8 font-semibold tracking-[-0.02em] text-[#0a0a0a]">
            {APP_NAME}
          </div>
        </div>

        <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto sm:flex-nowrap">
          <SearchField
            className="w-full sm:w-[280px] [&_input]:h-10 [&_input]:rounded-[10px] [&_input]:border-zinc-200 [&_input]:bg-white [&_input]:px-4 [&_input]:pl-10 [&_input]:text-[14px] [&_input]:leading-5 [&_input]:shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="搜索别名或实例名"
            value={keyword}
          />
          {onBrowseTemplates ? (
            <Button
              className="h-10 min-w-[124px] gap-2 rounded-[8px] border-zinc-200 px-4 text-[14px] leading-5 font-medium text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
              onClick={onBrowseTemplates}
              size="md"
              variant="secondary"
            >
              <LayoutTemplate className="h-4 w-4" />
              浏览模板
            </Button>
          ) : null}
          <Button
            className="h-10 min-w-[126px] gap-2 rounded-[8px] bg-[#18181b] px-4 text-[14px] leading-5 font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-black"
            leading={<Plus className="h-4 w-4" />}
            onClick={onCreate}
            size="md"
          >
            创建 Agent
          </Button>
        </div>
      </div>
    </header>
  )
}
