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

function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
      <div className="border-b border-zinc-100 pb-4">
        <div className="text-lg font-medium text-zinc-950">{title}</div>
        {description ? <p className="mt-1.5 text-sm leading-6 text-zinc-500">{description}</p> : null}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  )
}

function RuntimeMetaItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
        <span className="text-zinc-500">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-2 break-all text-sm font-medium text-zinc-900">{value}</div>
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
    <div className="flex min-w-[720px] flex-col gap-4">
      <FormSection
        description="创建页保持桌面工作台布局，模板信息和运行时默认值在这里固定展示，避免窗口缩小时内容直接塌成单列。"
        title="运行时模板"
      >
        <div className="flex items-start gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <img alt={`${template.name} logo`} className="h-10 w-10 object-cover" src={template.logo} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="text-base font-medium text-zinc-950">{template.name}</div>
              <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600">
                {template.docsLabel}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-6 text-zinc-500">{template.description}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <RuntimeMetaItem icon={<Cpu size={14} />} label="默认镜像" value={template.image} />
          <RuntimeMetaItem icon={<Database size={14} />} label="默认端口" value={String(template.port)} />
          <RuntimeMetaItem icon={<HardDrive size={14} />} label="工作目录" value={template.defaultWorkingDirectory} />
        </div>
      </FormSection>

      <FormSection
        description="用户只需要填写别名；系统实例名会自动生成，并继续用于资源关联与账单侧识别。"
        title="基础配置"
      >
        {mode === 'create' ? (
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-3 gap-4">
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
      </FormSection>

      <FormSection
        description="资源配置沿用 DevBox 的桌面表单节奏：预设在上，自定义输入在下，默认保持双列或三列，不在普通桌面小窗里直接堆叠成一列。"
        title="资源规格"
      >
        <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
          {RESOURCE_PRESETS.map((preset) => {
            const active = blueprint.profile === preset.id
            return (
              <button
                className={`rounded-xl border px-4 py-4 text-left transition ${
                  active
                    ? 'border-zinc-900 bg-zinc-50 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
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
                <div className="mt-2 text-xs leading-5 text-zinc-500">{preset.description}</div>
              </button>
            )
          })}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-4">
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
      </FormSection>

      <FormSection
        description="创建阶段直接展示后端确保后的 AIProxy 地址和密钥策略，减少用户在 Agent 启动后再回头补模型配置。"
        title="模型接入"
      >
        {mode === 'create' ? (
          <div className="grid grid-cols-2 gap-4">
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
              hint="当前模板会按 Hermes 运行时约定使用自定义 provider 配置。"
              label="Provider"
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
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Input
              hint="对应后端 create / patch 请求中的 agent-model-provider。"
              label="Provider"
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
          <div className="mt-4">
            <Input
              hint="例如 gpt-4o-mini。"
              label="模型名称"
              onChange={(event) => onChange('model', event.target.value)}
              placeholder="例如 gpt-4o-mini"
              value={blueprint.model}
            />
          </div>
        )}
      </FormSection>
    </div>
  )
}
