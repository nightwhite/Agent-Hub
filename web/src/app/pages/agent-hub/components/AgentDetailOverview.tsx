import {
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  Terminal,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { AgentListItem } from '../../../../domains/agents/types'
import { formatCpu, formatMemory, formatStorage } from '../../../../lib/format'
import { StatusBadge } from '../../../../components/ui/StatusBadge'

function OverviewCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
      <div className="text-sm font-medium text-zinc-950">{title}</div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 py-2.5 last:border-b-0 last:pb-0 first:pt-0">
      <span className="shrink-0 text-xs text-zinc-500">{label}</span>
      <span
        className={[
          'text-right text-sm font-medium text-zinc-950',
          mono ? 'break-all font-mono text-xs' : '',
        ].join(' ')}
      >
        {value || '--'}
      </span>
    </div>
  )
}

function MetricItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-zinc-950">{value}</div>
    </div>
  )
}

function CapabilityItem({
  icon,
  label,
  enabled,
}: {
  icon: ReactNode
  label: string
  enabled: boolean
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
      <span className="text-zinc-500">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className={enabled ? 'text-emerald-600' : 'text-zinc-400'}>
        {enabled ? <CheckCircle2 size={16} /> : <LoaderCircle size={16} />}
      </span>
    </div>
  )
}

interface AgentDetailOverviewProps {
  item: AgentListItem
}

export function AgentDetailOverview({ item }: AgentDetailOverviewProps) {
  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <OverviewCard title="基础信息">
          <InfoRow label="别名" value={item.aliasName || item.name} />
          <InfoRow label="实例名称" value={item.name} mono />
          <InfoRow label="命名空间" value={item.namespace} mono />
          <InfoRow label="模板" value={item.template.name} />
        </OverviewCard>

        <OverviewCard title="运行状态">
          <div className="mb-3 flex items-center justify-between gap-3">
            <StatusBadge status={item.status} />
            <span className="text-xs text-zinc-500">
              Ready: {item.ready ? 'Yes' : 'No'}
            </span>
          </div>
          <InfoRow label="Bootstrap Phase" value={item.bootstrapPhase || 'pending'} />
          <InfoRow label="Bootstrap Message" value={item.bootstrapMessage || '等待中'} />
        </OverviewCard>
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <OverviewCard title="资源规格">
          <div className="grid gap-2 md:grid-cols-3">
            <MetricItem icon={<Cpu size={14} />} label="CPU" value={formatCpu(item.cpu)} />
            <MetricItem
              icon={<Database size={14} />}
              label="内存"
              value={formatMemory(item.memory)}
            />
            <MetricItem
              icon={<HardDrive size={14} />}
              label="存储"
              value={formatStorage(item.storage)}
            />
          </div>
          <div className="mt-3">
            <InfoRow label="工作目录" value={item.workingDir || '--'} mono />
          </div>
        </OverviewCard>

        <OverviewCard title="模型接入">
          <InfoRow label="Provider" value={item.modelProvider || '--'} />
          <InfoRow label="模型" value={item.model || '--'} />
          <InfoRow label="Base URL" value={item.modelBaseURL || '--'} mono />
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <CapabilityItem
              enabled={item.chatAvailable}
              icon={<Bot size={14} />}
              label="对话"
            />
            <CapabilityItem
              enabled={item.terminalAvailable}
              icon={<Terminal size={14} />}
              label="终端"
            />
            <CapabilityItem enabled={true} icon={<FolderOpen size={14} />} label="文件" />
          </div>
        </OverviewCard>
      </div>
    </div>
  )
}
