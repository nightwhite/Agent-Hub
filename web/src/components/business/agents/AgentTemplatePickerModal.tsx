import { ChevronRight } from 'lucide-react'
import { AGENT_TEMPLATE_LIST } from '../../../domains/agents/templates'
import type { AgentTemplateDefinition, AgentTemplateId } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'

interface AgentTemplatePickerModalProps {
  open: boolean
  selectedTemplateId: AgentTemplateId
  onClose: () => void
  onSelect: (templateId: AgentTemplateId) => void
  onContinue: () => void
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
      className={`group flex flex-col rounded-[24px] border p-5 text-left transition ${
        active
          ? 'border-slate-900 bg-slate-50 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <img alt={`${template.name} logo`} className="h-9 w-9 object-cover" src={template.logo} />
          </div>
          <div>
            <div className="text-base font-semibold text-slate-950">{template.name}</div>
            <div className="mt-1 text-xs text-slate-500">{template.docsLabel}</div>
          </div>
        </div>
        {template.availabilityLabel ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {template.availabilityLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-4 flex-1 text-sm leading-6 text-slate-500">{template.description}</p>
      <div className="mt-5 inline-flex items-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">
        选择模板
        <ChevronRight className="ml-1" size={14} />
      </div>
    </button>
  )
}

export function AgentTemplatePickerModal({
  open,
  selectedTemplateId,
  onClose,
  onSelect,
  onContinue,
}: AgentTemplatePickerModalProps) {
  return (
    <Modal
      description="按照参考版本的创建路径，先选择 Agent 模板，再进入资源配置。"
      onClose={onClose}
      open={open}
      title="选择 Agent 模板"
      widthClassName="max-w-4xl"
      footer={<Button onClick={onContinue}>下一步</Button>}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {AGENT_TEMPLATE_LIST.map((template) => (
          <TemplateCard
            active={template.id === selectedTemplateId}
            key={template.id}
            onSelect={() => onSelect(template.id)}
            template={template}
          />
        ))}
      </div>
    </Modal>
  )
}
