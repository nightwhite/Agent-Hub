import { Cpu, Database, HardDrive } from 'lucide-react'
import type { ReactNode } from 'react'
import { resolveCreateModelOptions } from '../../../domains/agents/models'
import { RESOURCE_PRESETS, resolveTemplateById } from '../../../domains/agents/templates'
import type { AgentBlueprint, AgentTemplateId } from '../../../domains/agents/types'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'

interface AgentConfigFormProps {
  mode: 'create' | 'edit'
  templateId: AgentTemplateId
  blueprint: AgentBlueprint
  workspaceModelBaseURL: string
  workspaceModelKey: string
  workspaceModelKeyReady: boolean
  onChange: (field: keyof AgentBlueprint, value: string) => void
  onSelectPreset: (presetId: AgentBlueprint['profile']) => void
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
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-zinc-900">{value}</div>
    </div>
  )
}

export function AgentConfigForm({
  mode,
  templateId,
  blueprint,
  workspaceModelBaseURL,
  workspaceModelKey,
  workspaceModelKeyReady,
  onChange,
  onSelectPreset,
}: AgentConfigFormProps) {
  const template = resolveTemplateById(templateId)
  const isCustomPreset = blueprint.profile === 'custom'
  const resolvedModelBaseURL = workspaceModelBaseURL || blueprint.modelBaseURL
  const resolvedModelAPIKey = workspaceModelKey || '打开页面时自动检查，如缺失会先创建后填入'
  const createModeProviderText = 'custom'
  const createModelOptions = resolveCreateModelOptions(templateId)

  return (
    <div className="space-y-4">
      {mode === 'create' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            hint="这是用户侧的展示名称；系统会自动生成一个技术实例名用于资源关联和账单查询。"
            label="别名"
            onChange={(event) => onChange('aliasName', event.target.value)}
            placeholder="例如：客服助手"
            value={blueprint.aliasName}
          />
          <Input disabled hint="实例会创建在当前工作区命名空间。" label="命名空间" value={blueprint.namespace} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            hint="这是用户侧的展示名称。"
            label="别名"
            onChange={(event) => onChange('aliasName', event.target.value)}
            placeholder="例如：客服助手"
            value={blueprint.aliasName}
          />
          <Input
            disabled
            hint="技术实例名由系统生成，用于资源关联和账单查询。"
            label="实例名称"
            value={blueprint.appName}
          />
          <Input disabled label="命名空间" value={blueprint.namespace} />
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-3">
        <div className="mb-3 text-sm font-medium text-zinc-950">资源规格</div>
        <div className="grid gap-2 lg:grid-cols-4">
          {RESOURCE_PRESETS.map((preset) => {
            const active = blueprint.profile === preset.id
            return (
              <button
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  active
                    ? 'border-zinc-900 bg-white shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/70'
                }`}
                key={preset.id}
                onClick={() => onSelectPreset(preset.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-zinc-950">{preset.label}</span>
                  {active ? (
                    <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white">
                      当前
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 text-xs leading-5 text-zinc-500">{preset.description}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <MetricCard icon={<Cpu size={14} />} label="默认镜像" value={template.image} />
        <MetricCard icon={<Database size={14} />} label="默认端口" value={String(template.port)} />
        <MetricCard icon={<HardDrive size={14} />} label="工作目录" value={template.defaultWorkingDirectory} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
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

      {mode === 'create' ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
          <div className="text-sm font-medium text-zinc-950">模型接入</div>
          <p className="mt-1.5 text-xs leading-5 text-zinc-500">
            当前创建流程会通过 AIProxy 自动补齐密钥，再把 OpenAI-compatible 配置写入模板运行时。
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Input
              className="font-mono text-xs"
              hint="后端会把这个基址写入模板运行时配置。"
              label="AIProxy 推理地址"
              readOnly
              value={resolvedModelBaseURL}
            />
            <Input
              className="font-mono text-xs"
              hint="页面侧只做展示，实际创建时由后端确保并注入。"
              label="AIProxy 密钥"
              readOnly
              value={
                workspaceModelKeyReady
                  ? resolvedModelAPIKey
                  : '正在检查工作区 AIProxy Key，创建时会自动补齐'
              }
            />
            <Input
              hint="当前模板默认走兼容 OpenAI 的自定义 provider。"
              label="Hermes Provider"
              readOnly
              value={createModeProviderText}
            />
            <Select
              hint="创建阶段必须明确模型。"
              label="模型名称"
              onChange={(event) => onChange('model', event.target.value)}
              value={blueprint.model}
            >
              <option value="">请选择模型</option>
              {createModelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.helper ? `${option.label} · ${option.helper}` : option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            hint="对应后端 create / patch 请求中的 agent-model-provider。"
            label="Hermes Provider"
            onChange={(event) => onChange('modelProvider', event.target.value)}
            placeholder="例如 custom / anthropic / gemini"
            value={blueprint.modelProvider}
          />
          <Input
            hint="需要是 http 或 https URL。"
            label="模型 Base URL"
            onChange={(event) => onChange('modelBaseURL', event.target.value)}
            placeholder="例如 https://api.openai.com/v1"
            value={blueprint.modelBaseURL}
          />
        </div>
      )}

      {mode === 'create' ? null : (
        <Input
          hint="例如 gpt-4o-mini。"
          label="模型名称"
          onChange={(event) => onChange('model', event.target.value)}
          placeholder="例如 gpt-4o-mini"
          value={blueprint.model}
        />
      )}
    </div>
  )
}
