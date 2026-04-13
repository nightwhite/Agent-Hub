import { Check, Copy, MessageSquare, Settings, Terminal, Trash2 } from 'lucide-react'
import { formatCpu, formatMemory, formatStorage } from '../../../lib/format'
import type { AgentListItem } from '../../../domains/agents/types'
import { EmptyState } from '../../ui/EmptyState'
import { StatusBadge } from '../../ui/StatusBadge'

interface AgentInstancesTableProps {
  items: AgentListItem[]
  copiedValue: string
  onCreate: () => void
  onCopy: (value: string, key: string) => void
  onChat: (item: AgentListItem) => void
  onTerminal: (item: AgentListItem) => void
  onEdit: (item: AgentListItem) => void
  onDelete: (item: AgentListItem) => void
}

export function AgentInstancesTable({
  items,
  copiedValue,
  onCreate,
  onCopy,
  onChat,
  onTerminal,
  onEdit,
  onDelete,
}: AgentInstancesTableProps) {
  if (!items.length) {
    return (
      <EmptyState
        action={
          <button className="btn-primary" onClick={onCreate} type="button">
            创建 Agent
          </button>
        }
        description="当前还没有 Agent 实例。你可以从右上角开始创建，也可以直接从这里创建第一个实例。"
        title="暂无 Agent 实例"
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">实例</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">模板</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">状态</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">资源规格</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">API 地址</th>
              <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const canChat = item.template.capabilities.includes('chat') && item.status === 'running'
              const canTerminal = item.template.capabilities.includes('terminal') && item.status === 'running'
              const copyKey = `${item.id}:api-url`

              return (
                <tr className="group transition hover:bg-slate-50/80" key={item.id}>
                  <td className="px-6 py-5 align-top">
                    <div className="font-medium text-slate-950">{item.name}</div>
                    <div className="mt-1 text-[11px] text-slate-400">labels id: {item.labelId}</div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        <img alt={`${item.template.name} logo`} className="h-8 w-8 object-cover" src={item.template.logo} />
                      </div>
                      <div>
                        <div className="font-medium text-slate-950">{item.template.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.template.docsLabel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="space-y-1 text-sm text-slate-600">
                      <div>CPU: {formatCpu(item.cpu)}</div>
                      <div>内存: {formatMemory(item.memory)}</div>
                      <div>存储: {formatStorage(item.storage)}</div>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="flex max-w-[280px] items-center gap-2">
                      <span className="truncate text-sm text-slate-500">{item.apiUrl || '当前未生成公网地址'}</span>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!item.apiUrl}
                        onClick={() => onCopy(item.apiUrl, copyKey)}
                        type="button"
                      >
                        {copiedValue === copyKey ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="flex justify-end gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                      <button
                        className="btn-ghost"
                        disabled={!canChat}
                        onClick={() => onChat(item)}
                        title={canChat ? '对话' : '当前模板或状态不支持对话'}
                        type="button"
                      >
                        <MessageSquare size={16} />
                      </button>
                      <button
                        className="btn-ghost"
                        disabled={!canTerminal}
                        onClick={() => onTerminal(item)}
                        title={canTerminal ? '终端' : '当前状态不可进入终端'}
                        type="button"
                      >
                        <Terminal size={16} />
                      </button>
                      <button className="btn-ghost" onClick={() => onEdit(item)} title="配置" type="button">
                        <Settings size={16} />
                      </button>
                      <button
                        className="btn-ghost hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => onDelete(item)}
                        title="删除"
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
