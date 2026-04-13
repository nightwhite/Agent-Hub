import { Cpu, Database, HardDrive } from 'lucide-react'
import {
  RESOURCE_PRESETS,
  resolveTemplateById,
} from '../../../domains/agents/templates'
import type { AgentBlueprint, AgentTemplateId } from '../../../domains/agents/types'
import type { ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Modal } from '../../ui/Modal'

interface AgentConfigModalProps {
  open: boolean
  mode: 'create' | 'edit'
  templateId: AgentTemplateId
  blueprint: AgentBlueprint
  submitting: boolean
  onClose: () => void
  onChange: (field: keyof AgentBlueprint, value: string) => void
  onSelectPreset: (presetId: AgentBlueprint['profile']) => void
  onSubmit: () => void
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  )
}

export function AgentConfigModal({
  open,
  mode,
  templateId,
  blueprint,
  submitting,
  onClose,
  onChange,
  onSelectPreset,
  onSubmit,
}: AgentConfigModalProps) {
  const template = resolveTemplateById(templateId)
  const isCustomPreset = blueprint.profile === 'custom'

  return (
    <Modal
      description={mode === 'create' ? '只保留普通用户必须理解的配置项，隐藏 Kubernetes 细节。' : `正在编辑 ${blueprint.appName} 的资源规格。`}
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            取消
          </Button>
          <Button disabled={submitting} onClick={onSubmit}>
            {submitting ? '部署中...' : mode === 'create' ? '确认部署' : '保存配置'}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={mode === 'create' ? `配置 ${template.name}` : `配置 ${template.name}`}
      widthClassName="max-w-4xl"
    >
      <div className="space-y-6">
        <div className="flex items-start gap-4 rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-5">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <img alt={`${template.name} logo`} className="h-10 w-10 object-cover" src={template.logo} />
          </div>
          <div className="space-y-2">
            <div className="text-base font-semibold text-slate-950">{template.name}</div>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">{template.description}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            disabled
            hint="实例名由系统生成并对齐 DNS 规则。"
            label="实例名称"
            value={blueprint.appName}
          />
          <Input disabled label="命名空间" value={blueprint.namespace} />
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-5">
          <div className="mb-4 text-sm font-semibold text-slate-950">资源规格</div>
          <div className="grid gap-3 lg:grid-cols-4">
            {RESOURCE_PRESETS.map((preset) => {
              const active = blueprint.profile === preset.id
              return (
                <button
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    active
                      ? 'border-slate-900 bg-slate-50 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                  key={preset.id}
                  onClick={() => onSelectPreset(preset.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-950">{preset.label}</span>
                    {active ? <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">当前</span> : null}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-slate-500">{preset.description}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <MetricCard icon={<Cpu size={14} />} label="默认镜像" value={template.image} />
          <MetricCard icon={<Database size={14} />} label="默认端口" value={String(template.port)} />
          <MetricCard icon={<HardDrive size={14} />} label="工作目录" value={template.defaultWorkingDirectory} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Input
            disabled={!isCustomPreset}
            label="CPU"
            onChange={(event) => onChange('cpu', event.target.value)}
            placeholder="例如 2000m"
            value={blueprint.cpu}
          />
          <Input
            disabled={!isCustomPreset}
            label="内存"
            onChange={(event) => onChange('memory', event.target.value)}
            placeholder="例如 4096Mi"
            value={blueprint.memory}
          />
          <Input
            label="存储"
            onChange={(event) => onChange('storageLimit', event.target.value)}
            placeholder="例如 10Gi"
            value={blueprint.storageLimit}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            disabled
            hint={template.capabilities.includes('chat') ? '部署后会直接用于对话验证。' : '当前模板暂不直接启用对话入口。'}
            label="公网 API 地址"
            value={blueprint.apiUrl}
          />
          <Input
            disabled
            hint="系统自动生成访问密钥。"
            label="API Key"
            value={blueprint.apiKey}
          />
        </div>

        <div className="rounded-[24px] border border-sky-100 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-900">
          创建后系统会统一创建 DevBox、Service 和 Ingress。用户只需要理解“一个 Agent 实例”，不需要处理底层资源类型。
        </div>
      </div>
    </Modal>
  )
}
