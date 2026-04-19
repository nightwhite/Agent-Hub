import { LayoutTemplate } from 'lucide-react'
import { cn } from '../../../lib/format'
import type { AgentTemplateDefinition, AgentTemplateId } from '../../../domains/agents/types'

interface AgentTemplatePickerPanelProps {
  onSelect: (templateId: AgentTemplateId) => void
  templates: AgentTemplateDefinition[]
}

const accessMeta: Record<string, { label: string; dotClassName: string }> = {
  api: { label: 'API', dotClassName: 'bg-blue-500' },
  terminal: { label: '终端', dotClassName: 'bg-violet-500' },
  files: { label: '文件', dotClassName: 'bg-sky-500' },
  ssh: { label: 'SSH', dotClassName: 'bg-emerald-500' },
  ide: { label: 'IDE', dotClassName: 'bg-amber-500' },
  'web-ui': { label: 'Web UI', dotClassName: 'bg-teal-500' },
} as const

function TemplateCard({
  template,
  onSelect,
}: {
  template: AgentTemplateDefinition
  onSelect: () => void
}) {
  return (
    <button
      className={cn(
        'group relative flex h-full w-full flex-col items-start overflow-hidden rounded-xl border-[0.5px] bg-white text-left transition-[border-color,box-shadow] duration-200',
        !template.backendSupported
          ? 'cursor-not-allowed select-none border-zinc-200 bg-zinc-50/80 opacity-90'
          : 'cursor-pointer border-zinc-200 shadow-[0px_2px_8px_-2px_rgba(0,0,0,0.08)] hover:border-zinc-900',
      )}
      disabled={!template.backendSupported}
      onClick={onSelect}
      type="button"
    >
      <div className="flex w-full flex-col items-start gap-3 px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3 self-stretch">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border-[0.5px] bg-white"
              style={{
                borderColor: `${template.brandColor}26`,
                backgroundColor: `${template.brandColor}08`,
              }}
            >
              <img alt={`${template.name} logo`} className="h-8 w-8 object-cover" src={template.logo} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm/5 font-medium tracking-[-0.01em] text-zinc-950">
                {template.name}
              </div>
              <div className="mt-0.5 truncate text-[11px]/4 text-zinc-400">{template.docsLabel}</div>
            </div>
          </div>

          <span
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-[12px]/5 font-medium text-zinc-700 opacity-0 transition-all duration-200',
              'group-hover:opacity-100 group-focus-visible:opacity-100',
            )}
          >
            <LayoutTemplate size={14} />
            选择
          </span>
        </div>

        <p className="line-clamp-2 min-h-[2.9rem] w-full text-[12px]/5 text-zinc-500">
          {template.description}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {template.access.map((access) => {
            const meta = accessMeta[access.key] || { label: access.label, dotClassName: 'bg-zinc-400' }
            return (
              <span
                className="inline-flex h-6 items-center gap-1.5 rounded-md bg-zinc-100 px-2 text-[11px]/4 font-medium text-zinc-600"
                key={access.key}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClassName)} />
                {meta.label}
              </span>
            )
          })}
        </div>

        {!template.backendSupported && template.createDisabledReason ? (
          <p className="line-clamp-2 text-[12px]/5 text-amber-700">{template.createDisabledReason}</p>
        ) : null}
      </div>

      <div className="flex h-9 w-full items-center justify-between border-t border-zinc-100 bg-zinc-50/50 px-4 text-[11px]/4 text-zinc-500">
        <span className="truncate">{template.shortName}</span>
        <span className="shrink-0">{template.backendSupported ? '可直接创建' : '仅展示'}</span>
      </div>
    </button>
  )
}

export function AgentTemplatePickerPanel({
  onSelect,
  templates,
}: AgentTemplatePickerPanelProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
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
