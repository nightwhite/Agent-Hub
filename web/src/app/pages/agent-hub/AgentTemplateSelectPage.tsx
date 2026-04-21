import { ArrowLeft, LayoutTemplate } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AgentTemplatePickerPanel,
  AgentTemplatePickerPanelLoading,
} from '../../../components/business/agents/AgentTemplatePickerPanel'
import { Badge } from '../../../components/ui/Badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { SearchField } from '../../../components/ui/SearchField'
import { Separator } from '../../../components/ui/Separator'
import { SelectMenu } from '../../../components/ui/SelectMenu'
import { AgentWorkspaceShell } from './components/AgentWorkspaceShell'
import { useAgentHub } from './hooks/AgentHubControllerContext'

type TemplateSort = 'default' | 'name'

export function AgentTemplateSelectPage() {
  const navigate = useNavigate()
  const { loading, templates } = useAgentHub()
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<TemplateSort>('default')

  const normalizedKeyword = keyword.trim().toLowerCase()

const filteredTemplates = useMemo(() => {
    let next = templates

    if (normalizedKeyword) {
      next = next.filter((template) =>
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
    }

    if (sort === 'name') {
      next = [...next].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    }

    return next
  }, [normalizedKeyword, sort, templates])

  const sortOptions = [
    { label: '默认排序', value: 'default' },
    { label: '按名称排序', value: 'name' },
  ] satisfies Array<{ label: string; value: TemplateSort }>

  return (
    <AgentWorkspaceShell>
      <div className="flex h-full w-full min-w-0 flex-col bg-[#fafafa]">
        <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-12 lg:py-10">
          <header className="flex flex-col gap-5 pb-8">
            <button
              className="flex w-fit cursor-pointer items-center gap-2 text-zinc-500 transition hover:text-zinc-950"
              onClick={() => navigate('/agents')}
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">返回 Agent 列表</span>
            </button>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-zinc-200 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    <LayoutTemplate className="h-4 w-4" />
                  </div>
                  <div className="truncate text-[24px]/8 font-semibold tracking-[-0.02em] text-[#0a0a0a]">
                    模板市场
                  </div>
                </div>
                <p className="max-w-3xl text-sm leading-6 text-zinc-500">
                  从模板选择一个 Agent 起点，快速进入创建流程。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Badge variant="outline">{templates.length} 个模板</Badge>
              </div>
            </div>
          </header>

          <div className="flex flex-col xl:min-h-0 xl:flex-1 xl:overflow-hidden">
            <Card className="flex flex-col overflow-hidden rounded-[16px] border-zinc-200 bg-white xl:min-h-0 xl:flex-1">
              <CardHeader className="gap-4 p-6 pb-5 lg:px-6 lg:py-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="space-y-1.5">
                    <CardTitle className="text-[16px] font-semibold tracking-[-0.01em] text-zinc-950">
                      模板列表
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-zinc-500">
                      当前展示 {filteredTemplates.length} 个模板。
                    </CardDescription>
                  </div>
                  <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
                    <SearchField
                      className="w-full sm:flex-1 xl:w-[280px] [&_input]:h-10 [&_input]:rounded-[10px] [&_input]:border-zinc-200 [&_input]:bg-white [&_input]:px-4 [&_input]:pl-10 [&_input]:text-[14px] [&_input]:leading-5 [&_input]:shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder="搜索模板、能力或标签"
                      value={keyword}
                    />
                    <div className="w-full shrink-0 sm:w-[156px]">
                      <SelectMenu
                        onChange={(value) => setSort(value as TemplateSort)}
                        options={sortOptions}
                        value={sort}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>

              <Separator />

              <CardContent className="px-6 pb-6 !pt-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                {loading ? (
                  <AgentTemplatePickerPanelLoading />
                ) : filteredTemplates.length ? (
                  <AgentTemplatePickerPanel
                    onSelect={(templateId) => navigate(`/agents/create?template=${templateId}`)}
                    templates={filteredTemplates}
                  />
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center rounded-[14px] border border-dashed border-zinc-200 bg-zinc-50/60 p-8">
                    <EmptyState description="没有找到匹配的模板，试试更换关键词。" title="没有相关模板" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AgentWorkspaceShell>
  )
}
