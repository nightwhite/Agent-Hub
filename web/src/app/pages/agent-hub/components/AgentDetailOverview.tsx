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

function Panel({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border-[0.5px] border-zinc-200 bg-white p-6 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
      <div className="text-lg font-medium text-zinc-950">{title}</div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function MetaItem({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-zinc-500">{label}</span>
      <span
        className={[
          'text-sm font-medium text-zinc-900',
          mono ? 'break-all font-mono text-xs text-zinc-700' : '',
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
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-zinc-950">{value}</div>
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
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-700">
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
      <div className="flex h-[60%] min-h-fit w-full gap-2">
        <div className="flex-1">
          <Panel title="基础信息">
            <div className="grid grid-cols-2 gap-5">
              <MetaItem label="别名" value={item.aliasName || item.name} />
              <MetaItem label="模板" value={item.template.name} />
              <MetaItem label="实例名称" value={item.name} mono />
              <MetaItem label="命名空间" value={item.namespace} mono />
              <MetaItem label="工作目录" value={item.workingDir || '--'} mono />
              <MetaItem label="模型" value={item.model || '--'} />
            </div>
          </Panel>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Panel title="运行状态">
            <div className="flex items-start justify-between gap-3">
              <StatusBadge status={item.status} />
              <span className="text-sm text-zinc-500">Ready: {item.ready ? 'Yes' : 'No'}</span>
            </div>
            <div className="mt-5 grid gap-5">
              <MetaItem label="Bootstrap Phase" value={item.bootstrapPhase || 'pending'} />
              <MetaItem label="Bootstrap Message" value={item.bootstrapMessage || '等待中'} />
            </div>
          </Panel>

          <Panel title="能力">
            <div className="grid grid-cols-3 gap-2">
              <CapabilityItem enabled={item.chatAvailable} icon={<Bot size={14} />} label="对话" />
              <CapabilityItem
                enabled={item.terminalAvailable}
                icon={<Terminal size={14} />}
                label="终端"
              />
              <CapabilityItem enabled={true} icon={<FolderOpen size={14} />} label="文件" />
            </div>
          </Panel>
        </div>
      </div>

      <div className="flex w-full gap-2">
        <div className="flex-1">
          <Panel title="资源规格">
            <div className="grid grid-cols-3 gap-2">
              <MetricItem icon={<Cpu size={14} />} label="CPU" value={formatCpu(item.cpu)} />
              <MetricItem icon={<Database size={14} />} label="内存" value={formatMemory(item.memory)} />
              <MetricItem icon={<HardDrive size={14} />} label="存储" value={formatStorage(item.storage)} />
            </div>
          </Panel>
        </div>

        <div className="flex-1">
          <Panel title="模型接入">
            <div className="grid gap-5">
              <MetaItem label="Provider" value={item.modelProvider || '--'} />
              <MetaItem label="Base URL" value={item.modelBaseURL || '--'} mono />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
