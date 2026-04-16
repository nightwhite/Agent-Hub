import { CheckCircle2, Cpu, HardDrive, MemoryStick, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { resolveTemplateById } from '../../../../domains/agents/templates'
import { formatCpu, formatMemory, formatStorage } from '../../../../lib/format'
import type { AgentBlueprint, AgentTemplateId } from '../../../../domains/agents/types'

function SidebarSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
      <div className="border-b border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-950">{title}</div>
      <div className="px-4 py-3">{children}</div>
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
    <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
      <div className="flex min-w-0 items-center gap-2 text-sm text-zinc-600">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">{label}</div>
          {muted ? <div className="mt-1 text-xs text-zinc-500">{muted}</div> : null}
        </div>
      </div>
      <div className="min-w-0 max-w-[130px] text-right text-sm font-medium text-zinc-950">{value}</div>
    </div>
  )
}

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
    <aside className="flex w-[260px] shrink-0 flex-col gap-4">
      <SidebarSection title="已选模板">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
            <img alt={`${template.name} logo`} className="h-9 w-9 object-cover" src={template.logo} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-950">{template.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">{template.docsLabel}</div>
            <div className="mt-2 text-xs leading-5 text-zinc-500">{template.description}</div>
          </div>
        </div>
      </SidebarSection>

      <SidebarSection title="部署摘要">
        <div className="space-y-2.5">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">别名</div>
            <div className="mt-1.5 text-sm font-medium text-zinc-950">
              {blueprint.aliasName || '未填写'}
            </div>
            <div className="mt-1 text-xs text-zinc-500">实例名由系统自动生成并用于资源关联。</div>
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

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">模型</div>
            <div className="mt-1.5 text-sm font-medium text-zinc-950">
              {blueprint.model || '未选择'}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Provider: {blueprint.modelProvider || 'custom'}
            </div>
          </div>
        </div>
      </SidebarSection>

      <SidebarSection title="AIProxy">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-950">
          <Sparkles size={16} className="text-[var(--color-brand)]" />
          自动接入
        </div>
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-700">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={16} />
            创建时自动确保 `Agent-Hub` 密钥
          </div>
          <div className="mt-2 leading-5">
            创建流程会把工作区 AIProxy 地址与密钥注入模板初始化配置，避免用户手动补环境变量。
          </div>
        </div>
      </SidebarSection>
    </aside>
  )
}
