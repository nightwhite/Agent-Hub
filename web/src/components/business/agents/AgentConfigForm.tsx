import { HardDrive } from "lucide-react";
import type { ReactNode } from "react";
import { readBlueprintSettingValue } from "../../../domains/agents/blueprintFields";
import { formatModelProviderLabel } from "../../../domains/agents/aiproxy";
import {
  describeRegionModelPreset,
  RESOURCE_PRESETS,
} from "../../../domains/agents/templates";
import { cn } from "../../../lib/format";
import type {
  AgentBlueprint,
  AgentHubRegion,
  AgentSettingField,
  AgentTemplateDefinition,
} from "../../../domains/agents/types";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";

interface AgentConfigFormProps {
  mode: "create" | "edit";
  template: AgentTemplateDefinition | null;
  blueprint: AgentBlueprint;
  workspaceRegion: AgentHubRegion | string;
  workspaceModelBaseURL: string;
  workspaceModelKeyReady: boolean;
  onChangeTemplate?: () => void;
  onChange: (field: keyof AgentBlueprint, value: string) => void;
  onChangeSettingField: (field: AgentSettingField, value: string) => void;
  onSelectPreset: (presetId: AgentBlueprint["profile"]) => void;
}

function formatKeySourceLabel(value = "", ready = false) {
  if (!ready) return "未配置";
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "unset") return "未配置";
  if (normalized === "workspace-aiproxy") return "工作区 AI Proxy";
  return value;
}

function FormItem({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-sm font-medium text-zinc-900">{label}</div>
      {children}
      {hint ? (
        <div className="text-xs leading-5 text-zinc-500">{hint}</div>
      ) : null}
    </div>
  );
}

export function AgentConfigForm({
  mode,
  template,
  blueprint,
  workspaceRegion,
  workspaceModelBaseURL,
  workspaceModelKeyReady,
  onChangeTemplate,
  onChange,
  onChangeSettingField,
  onSelectPreset,
}: AgentConfigFormProps) {
  if (!template) {
    return null;
  }

  const isCustomPreset = blueprint.profile === "custom";
  const resolvedModelBaseURL = workspaceModelBaseURL || blueprint.modelBaseURL;
  const formWidthClassName = "w-full";
  const modelPresetHint = describeRegionModelPreset(
    String(workspaceRegion || "")
      .trim()
      .toLowerCase() === "cn"
      ? "cn"
      : "us",
    template,
  );

  const handleModelChange = (value: string) => {
    const option =
      template.modelOptions.find((item) => item.value === value) || null;
    const modelField = template.settings.agent.find(
      (item) => item.binding.key === "model",
    );
    const providerField = template.settings.agent.find(
      (item) => item.binding.key === "modelProvider",
    );

    if (modelField) {
      onChangeSettingField(modelField, value);
    } else {
      onChange("model", value);
    }

    if (providerField) {
      onChangeSettingField(providerField, option?.provider || "");
    } else {
      onChange("modelProvider", option?.provider || "");
    }
  };

  const resolveProviderValue = () => {
    const current = blueprint.modelProvider.trim();
    if (current) return current;
    const selectedModel = blueprint.model.trim();
    if (!selectedModel) return "";
    const option = template.modelOptions.find((item) => item.value === selectedModel);
    return String(option?.provider || "").trim();
  };

  const renderRuntimeItem = () => (
    <FormItem className={formWidthClassName} label="运行时环境">
      <div className="workbench-card flex flex-wrap items-center gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border-[0.5px] border-zinc-200 bg-zinc-50">
            <img
              alt={`${template.name} logo`}
              className="h-7 w-7 object-cover"
              src={template.logo}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-zinc-950">
                {template.name}
              </span>
              <span className="shrink-0 rounded-full border-[0.5px] border-zinc-200 bg-white px-2 py-0.5 text-xs/4 font-medium text-zinc-600">
                {template.docsLabel}
              </span>
            </div>
            <div className="mt-0.5 text-sm/5 text-zinc-500">
              {template.description || "暂无描述"}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex max-w-[170px] items-center gap-1.5 text-xs text-zinc-500">
            <HardDrive size={14} className="text-zinc-400" />
            <span className="truncate font-mono" title={template.workingDir}>
              {template.workingDir}
            </span>
          </div>
          {onChangeTemplate ? (
            <Button
              onClick={onChangeTemplate}
              size="md"
              type="button"
              variant="secondary"
            >
              更换模板
            </Button>
          ) : null}
        </div>
      </div>
    </FormItem>
  );

  const renderBaseConfig = () => (
    <FormItem
      className={formWidthClassName}
      hint="系统会自动生成实例名称。"
      label={mode === "create" ? "别名" : "基础信息"}
    >
      {mode === "create" ? (
        <Input
          className="w-full max-w-[320px]"
          onChange={(event) => onChange("aliasName", event.target.value)}
          placeholder="例如：客服助手"
          value={blueprint.aliasName}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <Input
            className="w-full max-w-[360px]"
            label="别名"
            onChange={(event) => onChange("aliasName", event.target.value)}
            placeholder="例如：客服助手"
            value={blueprint.aliasName}
          />
          <Input
            className="w-full max-w-[220px] font-mono text-xs"
            disabled
            label="实例名称"
            value={blueprint.appName}
          />
          <Input
            className="w-full max-w-[220px] font-mono text-xs"
            disabled
            label="命名空间"
            value={blueprint.namespace}
          />
        </div>
      )}
    </FormItem>
  );

  const renderResourceCard = () => (
    <div className={`workbench-card flex ${formWidthClassName} flex-col p-5`}>
      <span className="text-[1.02rem]/6 font-semibold tracking-[-0.02em] text-zinc-950">
        资源规格
      </span>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {RESOURCE_PRESETS.map((preset) => {
          const active = blueprint.profile === preset.id;
          return (
            <button
              className={`rounded-xl border px-3.5 py-3.5 text-left transition ${
                active
                  ? "border-zinc-900 bg-zinc-50 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
              }`}
              key={preset.id}
              onClick={() => onSelectPreset(preset.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-950">
                  {preset.label}
                </span>
                {active ? (
                  <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white">
                    当前
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-xs leading-5 text-zinc-500">
                {preset.description}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-start gap-2.5">
        <Input
          className="max-w-full w-[164px]"
          disabled={!isCustomPreset}
          label="CPU"
          onChange={(event) => onChange("cpu", event.target.value)}
          placeholder="例如 2000m"
          value={blueprint.cpu}
        />
        <Input
          className="max-w-full w-[164px]"
          disabled={!isCustomPreset}
          label="内存"
          onChange={(event) => onChange("memory", event.target.value)}
          placeholder="例如 4096Mi"
          value={blueprint.memory}
        />
        <Input
          className="max-w-full w-[164px]"
          label="存储"
          onChange={(event) => onChange("storageLimit", event.target.value)}
          placeholder="例如 10Gi"
          value={blueprint.storageLimit}
        />
      </div>
    </div>
  );

  const renderAgentField = (field: AgentSettingField) => {
    const fieldValue = readBlueprintSettingValue(blueprint, field);
    const bindingKey = String(field.binding?.key || "").trim();

    if (bindingKey === "modelProvider") {
      return (
        <Input
          className="max-w-full w-[240px]"
          hint="该字段会随模型自动切换。"
          label="模型渠道"
          readOnly
          value={formatModelProviderLabel(resolveProviderValue())}
        />
      );
    }

    if (bindingKey === "model") {
      return (
        <Select
          className="max-w-full w-[240px]"
          hint={modelPresetHint}
          label={field.label}
          onChange={(event) => handleModelChange(event.target.value)}
          value={fieldValue}
        >
          <option value="">选择模型</option>
          {template.modelOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.helper
                ? `${option.label} · ${option.helper}`
                : option.label}
            </option>
          ))}
        </Select>
      );
    }

    if (bindingKey === "modelBaseURL") {
      return (
        <Input
          className="w-full font-mono text-xs"
          hint={
            mode === "create"
              ? "创建时自动使用工作区地址。"
              : "保存后更新模型地址。"
          }
          label="模型地址"
          onChange={
            mode === "edit"
              ? (event) => onChangeSettingField(field, event.target.value)
              : undefined
          }
          readOnly={field.readOnly || mode === "create"}
          value={
            bindingKey === "modelBaseURL" ? resolvedModelBaseURL : fieldValue
          }
        />
      );
    }

    if (bindingKey === "keySource") {
      const keySourceLabel = formatKeySourceLabel(
        fieldValue,
        workspaceModelKeyReady,
      );
      return (
        <Input
          className="w-full font-mono text-xs"
          label="密钥来源"
          readOnly
          value={keySourceLabel}
        />
      );
    }

    if (field.type === "select") {
      return (
        <Select
          className="w-full"
          hint={field.description}
          label={field.label}
          onChange={(event) => onChangeSettingField(field, event.target.value)}
          value={fieldValue}
        >
          <option value="">选择</option>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      );
    }

    return (
      <Input
        className="w-full"
        hint={field.description}
        label={field.label}
        readOnly={field.readOnly}
        onChange={
          field.readOnly
            ? undefined
            : (event) => onChangeSettingField(field, event.target.value)
        }
        value={fieldValue}
      />
    );
  };

  const renderAgentSettingsCard = () => (
    <div className={`workbench-card flex ${formWidthClassName} flex-col p-5`}>
      <span className="text-[1.02rem]/6 font-semibold tracking-[-0.02em] text-zinc-950">
        Agent 设置
      </span>

      {template.settings.agent.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3.5">
          {template.settings.agent.map((field) => (
            <div key={field.key}>{renderAgentField(field)}</div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[12px]/5 text-zinc-500">
          当前模板没有额外配置项。
        </div>
      )}

    </div>
  );

  return (
    <div className={`relative flex ${formWidthClassName} flex-col gap-3`}>
      {renderRuntimeItem()}
      {renderBaseConfig()}
      {renderResourceCard()}
      {renderAgentSettingsCard()}
    </div>
  );
}
