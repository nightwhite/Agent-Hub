import { LayoutTemplate } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'
import { APP_NAME } from '../../../../branding'

interface AgentHubHeaderProps {
  operator: string
  namespace?: string
  onBrowseTemplates?: () => void
}

export function AgentHubHeader({
  operator,
  namespace,
  onBrowseTemplates,
}: AgentHubHeaderProps) {
  return (
    <header className="flex flex-shrink-0 flex-col gap-5 px-6 py-6 lg:px-12">
      <div className="min-w-0">
        <div className="truncate text-[28px]/8 font-extrabold tracking-[-0.03em] text-[#151b2d]">{APP_NAME}</div>
        <div className="mt-2 text-sm text-[#6d778a]">
          管理和监控你的 24/7 AI 工作者，持续为你处理任务。
          {namespace ? ` 当前命名空间：${namespace}` : ''}
          {operator ? ` · ${operator}` : ''}
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center justify-end gap-3">
        {onBrowseTemplates ? (
          <Button
            className="h-10 min-w-[124px] gap-2 rounded-[10px] px-4"
            onClick={onBrowseTemplates}
            size="md"
            variant="secondary"
          >
            <LayoutTemplate className="h-4 w-4" />
            浏览模板
          </Button>
        ) : null}
      </div>
    </header>
  )
}
