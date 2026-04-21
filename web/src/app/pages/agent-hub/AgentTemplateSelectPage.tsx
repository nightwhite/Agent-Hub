import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgentTemplatePickerPanel } from '../../../components/business/agents/AgentTemplatePickerPanel'
import { EmptyState } from '../../../components/ui/EmptyState'
import { SearchField } from '../../../components/ui/SearchField'
import { AgentWorkspaceShell } from './components/AgentWorkspaceShell'
import { AGENT_HUB_DIALOG_CONTENT_CLASSNAME } from './components/workspaceLayout'
import { useAgentHub } from './hooks/AgentHubControllerContext'
import { cn } from '../../../lib/format'

export function AgentTemplateSelectPage() {
  const navigate = useNavigate()
  const { loading, templates } = useAgentHub()
  const [keyword, setKeyword] = useState('')

  const normalizedKeyword = keyword.trim().toLowerCase()

  const filteredTemplates = useMemo(() => {
    if (!normalizedKeyword) return templates

    return templates.filter((template) =>
      [
        template.name,
        template.shortName,
        template.description,
        template.docsLabel,
        template.access.map((item) => item.label).join(' '),
        template.actions.map((item) => item.label).join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedKeyword),
    )
  }, [normalizedKeyword, templates])

  return (
    <AgentWorkspaceShell>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <div className={cn(AGENT_HUB_DIALOG_CONTENT_CLASSNAME, 'flex h-full flex-col')}>
          <header className="flex w-full items-center justify-between py-3">
            <button
              className="flex cursor-pointer items-center gap-2 text-zinc-900"
              onClick={() => navigate('/agents')}
              type="button"
            >
              <ArrowLeft className="h-5 w-5" />
              <p className="text-[1.35rem]/8 font-semibold tracking-[-0.02em]">模板市场</p>
            </button>
          </header>

          <div className="flex h-full w-full min-w-0 flex-col gap-3 pt-1">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="rounded-lg bg-zinc-100 px-3 py-2">
                <span className="text-sm/5 font-medium text-zinc-900">全部模板</span>
              </div>

              <div className="flex items-center lg:justify-end">
                <SearchField
                  className="w-full lg:w-64"
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索模板"
                  value={keyword}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <div className="flex h-full flex-col">
                <div className="flex flex-col gap-2 pb-3 lg:flex-row lg:items-center lg:justify-between">
                  <h2 className="text-[13px]/5 font-medium text-zinc-900">全部模板</h2>
                  <span className="shrink-0 text-[12px]/5 text-zinc-500">
                    {filteredTemplates.length} 个模板
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pb-4 pr-1 lg:pr-2">
                  {loading ? (
                    <div className="workbench-card-strong flex min-h-[320px] items-center justify-center text-[13px]/5 text-zinc-500">
                      正在载入模板...
                    </div>
                  ) : filteredTemplates.length ? (
                    <AgentTemplatePickerPanel
                      onSelect={(templateId) => navigate(`/agents/create?template=${templateId}`)}
                      templates={filteredTemplates}
                    />
                  ) : (
                    <EmptyState description="没有找到匹配的模板，试试更换关键词。" title="没有相关模板" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AgentWorkspaceShell>
  )
}
