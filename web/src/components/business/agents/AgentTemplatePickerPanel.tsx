import { LayoutTemplate } from 'lucide-react'
import { AGENT_TEMPLATE_LIST } from '../../../domains/agents/templates'
import type { AgentTemplateDefinition, AgentTemplateId } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'

interface AgentTemplatePickerPanelProps {
  onSelect: (templateId: AgentTemplateId) => void
  templates?: AgentTemplateDefinition[]
}

function TemplateCard({
  template,
  onSelect,
}: {
  template: AgentTemplateDefinition
  onSelect: () => void
}) {
  return (
    <div
      className={[
        'group relative flex h-full w-full max-w-[375px] flex-col items-start rounded-xl border bg-white text-left transition hover:border-zinc-900',
        !template.backendSupported
          ? 'pointer-events-none cursor-not-allowed select-none border-zinc-200 bg-zinc-50/70 opacity-80'
          : 'border-zinc-200',
      ].join(' ')}
      onClick={template.backendSupported ? onSelect : undefined}
      onKeyDown={(event) => {
        if (!template.backendSupported) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      role="button"
      tabIndex={template.backendSupported ? 0 : -1}
    >
      <div className="flex w-full flex-col items-start gap-2 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2 self-stretch">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border-[0.5px] border-zinc-200 bg-zinc-50">
              <img alt={`${template.name} logo`} className="h-7 w-7 object-cover" src={template.logo} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-950">{template.name}</div>
              <div className="mt-0.5 truncate text-xs text-zinc-500">{template.docsLabel}</div>
            </div>
          </div>

          <Button
            className="invisible h-8 gap-2 px-3 text-xs opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100"
            disabled={!template.backendSupported}
            onClick={(event) => {
              event.stopPropagation()
              onSelect()
            }}
            type="button"
          >
            <LayoutTemplate size={14} />
            选择
          </Button>
        </div>

        <p className="w-full truncate text-sm/5 text-zinc-500">{template.description}</p>

        {!template.backendSupported && template.createDisabledReason ? (
          <p className="text-xs leading-5 text-amber-700">{template.createDisabledReason}</p>
        ) : null}
      </div>
    </div>
  )
}

export function AgentTemplatePickerPanel({
  onSelect,
  templates = AGENT_TEMPLATE_LIST,
}: AgentTemplatePickerPanelProps) {
  return (
    <div className="flex flex-wrap items-stretch gap-4">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          onSelect={() => onSelect(template.id)}
          template={template}
        />
      ))}
    </div>
  )
}
