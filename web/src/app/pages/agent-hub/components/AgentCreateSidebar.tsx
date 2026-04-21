import { Cpu, HardDrive, MemoryStick } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatModelProviderLabel } from '../../../../domains/agents/aiproxy'
import { formatCpu, formatMemory, formatStorage } from '../../../../lib/format'
import type { AgentBlueprint, AgentTemplateDefinition } from '../../../../domains/agents/types'

function SidebarSection({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={['workbench-card flex flex-col', className || ''].join(' ')}>
      <div className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{title}</div>
      <div className="px-4 pt-2 pb-4">{children}</div>
    </section>
  )
}

function SummaryRow({
  icon,
  label,
  value,
  muted,
}: {
  icon: ReactNode
  label: string
  value: string
  muted?: string
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
      <div className="flex min-w-0 items-center gap-2.5 text-sm text-zinc-600">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">{label}</div>
          {muted ? <div className="mt-1 text-[12px]/5 text-zinc-500">{muted}</div> : null}
        </div>
      </div>
      <div className="min-w-0 max-w-[108px] text-right text-[1.125rem]/7 font-semibold tracking-[-0.03em] tabular-nums text-zinc-950">
        {value}
      </div>
    </div>
  )
}

interface AgentCreateSidebarProps {
  template: AgentTemplateDefinition | null
  blueprint: AgentBlueprint
}

export function AgentCreateSidebar({
  template,
  blueprint,
}: AgentCreateSidebarProps) {
  if (!template) {
    return null
  }

  const accessLabel = template.access.map((access) => access.label).join(' · ')

  return (
    <aside className="grid w-full gap-4 min-[760px]:grid-cols-2 min-[1120px]:w-[250px] min-[1120px]:grid-cols-1 min-[1360px]:w-[280px]">
      <SidebarSection title="已选模板">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border-[0.5px] border-zinc-200 bg-zinc-50">
            <img alt={`${template.name} logo`} className="h-8 w-8 object-cover" src={template.logo} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[1.05rem]/6 font-semibold tracking-[-0.02em] text-zinc-950">{template.name}</div>
            <div className="mt-0.5 text-[12px]/5 text-zinc-500">{template.docsLabel}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px]/4 font-medium text-zinc-600">
                {accessLabel || '基础能力'}
              </span>
            </div>
            <div className="mt-2 text-[13px]/6 text-zinc-500">{template.description}</div>
          </div>
        </div>
      </SidebarSection>

      <SidebarSection title="部署摘要">
        <div className="space-y-2">
          <div className="rounded-2xl border-[0.5px] border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">别名</div>
            <div className="mt-1.5 text-lg/7 font-semibold tracking-[-0.03em] text-zinc-950">
              {blueprint.aliasName || '未填写'}
            </div>
            <div className="mt-1 text-[12px]/5 text-zinc-500">实例名由系统自动生成。</div>
          </div>

          <SummaryRow
            icon={<Cpu size={15} />}
            label="CPU"
            value={formatCpu(blueprint.cpu)}
          />
          <SummaryRow
            icon={<MemoryStick size={15} />}
            label="内存"
            value={formatMemory(blueprint.memory)}
          />
          <SummaryRow
            icon={<HardDrive size={15} />}
            label="存储"
            value={formatStorage(blueprint.storageLimit)}
          />

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">模型</div>
            <div className="mt-1.5 truncate text-[1rem]/6 font-semibold tracking-[-0.02em] text-zinc-950">
              {blueprint.model || '未选择'}
            </div>
            <div className="mt-1 text-[12px]/5 text-zinc-500">
              模型渠道：{formatModelProviderLabel(blueprint.modelProvider)}
            </div>
          </div>
        </div>
      </SidebarSection>

    </aside>
  )
}
