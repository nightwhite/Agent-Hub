import { CheckCircle2, Sparkles } from 'lucide-react'
import { resolveTemplateById } from '../../../../domains/agents/templates'
import { formatCpu, formatMemory, formatStorage } from '../../../../lib/format'
import type { AgentBlueprint, AgentTemplateId } from '../../../../domains/agents/types'

interface AgentCreateSidebarProps {
  templateId: AgentTemplateId
  blueprint: AgentBlueprint
}

export function AgentCreateSidebar({
  templateId,
  blueprint,
}: AgentCreateSidebarProps) {
  const template = resolveTemplateById(templateId)

  return (
    <aside className="space-y-3">
      <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
            <img alt={`${template.name} logo`} className="h-9 w-9 object-cover" src={template.logo} />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-950">{template.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">{template.docsLabel}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">即将部署</div>
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">别名</div>
            <div className="mt-1.5 text-sm font-medium text-zinc-950">
              {blueprint.aliasName || '未填写'}
            </div>
          </div>
          <div className="grid gap-2">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">CPU</div>
              <div className="mt-1.5 text-sm font-medium text-zinc-950">{formatCpu(blueprint.cpu)}</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">内存</div>
              <div className="mt-1.5 text-sm font-medium text-zinc-950">{formatMemory(blueprint.memory)}</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">存储</div>
              <div className="mt-1.5 text-sm font-medium text-zinc-950">
                {formatStorage(blueprint.storageLimit)}
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">模型</div>
            <div className="mt-1.5 text-sm font-medium text-zinc-950">
              {blueprint.model || '未选择'}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Provider: {blueprint.modelProvider || 'custom'}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-950">
          <Sparkles size={16} className="text-[var(--color-brand)]" />
          AIProxy
        </div>
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
          <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 size={16} />
            创建时自动确保 `Agent-Hub` 密钥
          </div>
        </div>
      </section>
    </aside>
  )
}
