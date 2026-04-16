import { ChevronRight } from 'lucide-react'
import { AGENT_TEMPLATE_LIST } from '../../../domains/agents/templates'
import type { AgentTemplateDefinition, AgentTemplateId } from '../../../domains/agents/types'

interface AgentTemplatePickerPanelProps {
  selectedTemplateId: AgentTemplateId
  onSelect: (templateId: AgentTemplateId) => void
}

function TemplateCard({
  template,
  active,
  onSelect,
}: {
  template: AgentTemplateDefinition
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`group flex flex-col rounded-xl border p-3 text-left transition ${
        !template.backendSupported
          ? 'cursor-not-allowed border-zinc-200 bg-zinc-50/70 opacity-70'
          : active
            ? 'border-zinc-900 bg-zinc-50 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]'
            : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/70'
      }`}
      disabled={!template.backendSupported}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <img alt={`${template.name} logo`} className="h-8 w-8 object-cover" src={template.logo} />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-950">{template.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">{template.docsLabel}</div>
          </div>
        </div>
        {template.availabilityLabel ? (
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
            {template.availabilityLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 flex-1 text-xs leading-5 text-zinc-500">{template.description}</p>
      {!template.backendSupported && template.createDisabledReason ? (
        <p className="mt-3 text-xs leading-5 text-amber-700">{template.createDisabledReason}</p>
      ) : null}
      <div className="mt-3 inline-flex items-center text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-brand)]">
        {template.backendSupported ? '选择模板' : '等待后端接入'}
        <ChevronRight className="ml-1" size={14} />
      </div>
    </button>
  )
}

export function AgentTemplatePickerPanel({
  selectedTemplateId,
  onSelect,
}: AgentTemplatePickerPanelProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {AGENT_TEMPLATE_LIST.map((template) => (
        <TemplateCard
          active={template.id === selectedTemplateId}
          key={template.id}
          onSelect={() => onSelect(template.id)}
          template={template}
        />
      ))}
    </div>
  )
}
