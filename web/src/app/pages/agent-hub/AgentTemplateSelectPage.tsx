import { ArrowLeft, LayoutTemplate } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgentTemplatePickerPanel } from '../../../components/business/agents/AgentTemplatePickerPanel'
import { EmptyState } from '../../../components/ui/EmptyState'
import { SearchField } from '../../../components/ui/SearchField'
import { AgentWorkspaceShell } from './components/AgentWorkspaceShell'
import { AGENT_TEMPLATE_LIST } from '../../../domains/agents/templates'

export function AgentTemplateSelectPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')

  const filteredTemplates = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return AGENT_TEMPLATE_LIST

    return AGENT_TEMPLATE_LIST.filter((template) =>
      [template.name, template.shortName, template.description, template.docsLabel]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    )
  }, [keyword])

  return (
    <AgentWorkspaceShell>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <div className="flex h-24 w-full items-center justify-between self-stretch border-b border-zinc-200 px-10 py-8">
          <button
            className="flex cursor-pointer items-center gap-3 text-zinc-900"
            onClick={() => navigate('/agents')}
            type="button"
          >
            <ArrowLeft className="h-6 w-6" />
            <p className="text-2xl/8 font-semibold">模板市场</p>
          </button>
        </div>

        <div className="flex h-full w-full min-w-0 flex-col gap-5 px-10 pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-base font-medium text-zinc-900">
              <LayoutTemplate className="h-5 w-5" />
              <span>全部模板</span>
            </div>

            <div className="flex items-center pr-2">
              <SearchField
                className="w-[370px]"
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索模板"
                value={keyword}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-6">
            {filteredTemplates.length ? (
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
    </AgentWorkspaceShell>
  )
}
