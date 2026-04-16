import { HardDrive } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../../lib/format'
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

function FormItem({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="text-sm font-medium text-zinc-900">{label}</div>
      {children}
      {hint ? <div className="text-xs leading-5 text-zinc-500">{hint}</div> : null}
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
  const createModeProviderText = 'custom'
  const createModelOptions = resolveCreateModelOptions(templateId)

  const renderRuntimeItem = () => (
    <FormItem label="运行时环境">
      <div className="flex items-center rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex w-[500px] min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border-[0.5px] border-zinc-200 bg-zinc-50">
            <img alt={`${template.name} logo`} className="h-7 w-7 object-cover" src={template.logo} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-zinc-950">{template.name}</span>
              <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-600">
                {template.docsLabel}
              </span>
            </div>
            <div className="mt-0.5 truncate text-sm/5 text-zinc-500">
              {template.description || '暂无描述'}
            </div>
          </div>
        </div>

        <div className="ml-auto flex h-10 items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <HardDrive size={14} className="text-zinc-400" />
            <span className="font-mono" title={template.defaultWorkingDirectory}>
              {template.defaultWorkingDirectory}
            </span>
          </div>
        </div>
      </div>
    </FormItem>
  )

  const renderBaseConfig = () => (
    <FormItem
      hint="用户只需要填写别名；系统实例名会自动生成，并继续用于资源关联与账单侧识别。"
      label={mode === 'create' ? '别名' : '基础信息'}
    >
      {mode === 'create' ? (
        <Input
          className="w-[400px]"
          onChange={(event) => onChange('aliasName', event.target.value)}
          placeholder="例如：客服助手"
          value={blueprint.aliasName}
        />
      ) : (
        <div className="flex items-start gap-6">
          <Input
            className="w-[400px]"
            label="别名"
            onChange={(event) => onChange('aliasName', event.target.value)}
            placeholder="例如：客服助手"
            value={blueprint.aliasName}
          />
          <Input
            className="w-[260px] font-mono text-xs"
            disabled
            label="实例名称"
            value={blueprint.appName}
          />
          <Input
            className="w-[260px] font-mono text-xs"
            disabled
            label="命名空间"
            value={blueprint.namespace}
          />
        </div>
      )}
    </FormItem>
  )

  const renderResourceCard = () => (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-8">
      <span className="text-lg/7 font-medium text-zinc-950">资源规格</span>
      <div className="mt-6 grid grid-cols-2 gap-3">
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

      <div className="mt-10 flex items-start gap-4">
        <Input
          className="w-[200px]"
          disabled={!isCustomPreset}
          label="CPU"
          onChange={(event) => onChange('cpu', event.target.value)}
          placeholder="例如 2000m"
          value={blueprint.cpu}
        />
        <Input
          className="w-[200px]"
          disabled={!isCustomPreset}
          label="内存"
          onChange={(event) => onChange('memory', event.target.value)}
          placeholder="例如 4096Mi"
          value={blueprint.memory}
        />
        <Input
          className="w-[200px]"
          label="存储"
          onChange={(event) => onChange('storageLimit', event.target.value)}
          placeholder="例如 10Gi"
          value={blueprint.storageLimit}
        />
      </div>
    </div>
  )

  const renderModelCard = () => {
    if (mode === 'create') {
      return (
        <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-8">
          <span className="text-lg/7 font-medium text-zinc-950">模型接入</span>
          <div className="mt-6 flex items-start gap-4">
            <Input
              className="w-[520px] font-mono text-xs"
              hint="后端会把这个基址写入模板运行时配置。"
              label="AIProxy 推理地址"
              readOnly
              value={resolvedModelBaseURL}
            />
            <Input
              className="w-[520px] font-mono text-xs"
              hint="页面侧只做展示，实际创建时由后端确保并注入。"
              label="AIProxy 密钥"
              readOnly
              value={
                workspaceModelKeyReady
                  ? workspaceModelKey
                  : '正在检查工作区 AIProxy Key，创建时会自动补齐'
              }
            />
          </div>

          <div className="mt-6 flex items-start gap-4">
            <Input
              className="w-[240px]"
              hint="Provider 当前固定为 custom（走 AIProxy）。"
              label="Provider"
              readOnly
              value={createModeProviderText}
            />
            <Select
              className="w-[320px]"
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
      )
    }

    return (
      <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-8">
        <span className="text-lg/7 font-medium text-zinc-950">模型接入</span>
        <div className="mt-6 flex items-start gap-4">
          <Input
            className="w-[260px]"
            hint="对应后端 create / patch 请求中的 agent-model-provider。"
            label="Provider"
            onChange={(event) => onChange('modelProvider', event.target.value)}
            placeholder="例如 openai-compatible"
            value={blueprint.modelProvider}
          />
          <Input
            className="w-[520px]"
            hint="需要是 http 或 https URL。"
            label="模型 Base URL"
            onChange={(event) => onChange('modelBaseURL', event.target.value)}
            placeholder="例如 https://api.openai.com/v1"
            value={blueprint.modelBaseURL}
          />
          <Input
            className="w-[320px]"
            hint="例如 gpt-4o-mini。"
            label="模型名称"
            onChange={(event) => onChange('model', event.target.value)}
            placeholder="例如 gpt-4o-mini"
            value={blueprint.model}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-w-[700px] flex-col gap-4">
      {renderRuntimeItem()}
      {renderBaseConfig()}
      {renderResourceCard()}
      {renderModelCard()}
    </div>
  )
}
