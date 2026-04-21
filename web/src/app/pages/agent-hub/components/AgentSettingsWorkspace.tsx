import { HardDrive, Server, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { readBlueprintSettingValue } from "../../../../domains/agents/blueprintFields";
import { formatModelProviderLabel } from "../../../../domains/agents/aiproxy";
import {
  describeRegionModelPreset,
  RESOURCE_PRESETS,
} from "../../../../domains/agents/templates";
import type {
  AgentBlueprint,
  AgentHubRegion,
  AgentListItem,
  AgentSettingField,
  AgentTemplateDefinition,
} from "../../../../domains/agents/types";
import { cn } from "../../../../lib/format";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";

interface AgentSettingsWorkspaceProps {
  item: AgentListItem;
  template: AgentTemplateDefinition | null;
  runtimeBlueprint: AgentBlueprint;
  settingsBlueprint: AgentBlueprint;
  workspaceRegion: AgentHubRegion | string;
  workspaceModelBaseURL: string;
  workspaceModelKeyReady: boolean;
  submitting: boolean;
  onRuntimeChange: (field: keyof AgentBlueprint, value: string) => void;
  onRuntimePreset: (presetId: AgentBlueprint["profile"]) => void;
  onSaveRuntime: () => void;
  onSettingsChange: (field: keyof AgentBlueprint, value: string) => void;
  onSettingsFieldChange: (field: AgentSettingField, value: string) => void;
  onSaveSettings: () => void;
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

function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("workbench-card flex flex-col p-3.5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
            {title}
          </div>
          <div className="mt-1 text-[0.96rem]/6 font-semibold tracking-[-0.02em] text-zinc-950">
            {description}
          </div>
        </div>
        {actions}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function MetaPill({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border-[0.5px] border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-[0.5px] border-zinc-200 bg-white text-zinc-500">
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
          {label}
        </div>
        <div
          className={cn(
            "mt-1 truncate text-[13px]/5 font-medium text-zinc-900",
            mono && "font-mono text-xs text-zinc-700",
          )}
        >
          {value || "--"}
        </div>
      </div>
    </div>
  );
}

export function AgentSettingsWorkspace({
  item,
  template,
  runtimeBlueprint,
  settingsBlueprint,
  workspaceRegion,
  workspaceModelBaseURL,
  workspaceModelKeyReady,
  submitting,
  onRuntimeChange,
  onRuntimePreset,
  onSaveRuntime,
  onSettingsChange,
  onSettingsFieldChange,
  onSaveSettings,
}: AgentSettingsWorkspaceProps) {
  if (!template) {
    return null;
  }

  const runtimeIsCustomPreset = runtimeBlueprint.profile === "custom";
  const resolvedModelBaseURL =
    workspaceModelBaseURL || settingsBlueprint.modelBaseURL;
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
      template.modelOptions.find((entry) => entry.value === value) || null;
    const modelField = template.settings.agent.find(
      (item) => item.binding.key === "model",
    );
    const providerField = template.settings.agent.find(
      (item) => item.binding.key === "modelProvider",
    );

    if (modelField) {
      onSettingsFieldChange(modelField, value);
    } else {
      onSettingsChange("model", value);
    }

    if (providerField) {
      onSettingsFieldChange(providerField, option?.provider || "");
    } else {
      onSettingsChange("modelProvider", option?.provider || "");
    }
  };

  const renderAgentField = (field: AgentSettingField) => {
    const fieldValue = readBlueprintSettingValue(settingsBlueprint, field);
    const bindingKey = String(field.binding?.key || "").trim();

    if (bindingKey === "modelProvider") {
      return (
        <Input
          className="w-full max-w-[360px]"
          hint="随模型自动切换。"
          label="模型渠道"
          readOnly
          value={formatModelProviderLabel(fieldValue)}
        />
      );
    }

    if (bindingKey === "model") {
      return (
        <Select
          className="w-full max-w-[360px]"
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
          hint="模型入口地址。"
          label={field.label}
          onChange={(event) => onSettingsFieldChange(field, event.target.value)}
          readOnly={field.readOnly}
          value={resolvedModelBaseURL}
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
          onChange={(event) => onSettingsFieldChange(field, event.target.value)}
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
        onChange={
          field.readOnly
            ? undefined
            : (event) => onSettingsFieldChange(field, event.target.value)
        }
        readOnly={field.readOnly}
        value={fieldValue}
      />
    );
  };

  return (
    <div className="workbench-card-strong flex h-full min-h-0 flex-col overflow-y-auto p-3.5 min-[1320px]:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            设置
          </div>
          <div className="mt-1 text-[1rem]/6 font-semibold tracking-[-0.02em] text-zinc-950">
            实例设置
          </div>
          <div className="mt-1 text-[11px]/5 text-zinc-500">
            调整资源规格和运行参数。
          </div>
        </div>
        <div className="rounded-full border-[0.5px] border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px]/4 font-medium text-zinc-600">
          {template.name}
        </div>
      </div>

      <div className="mt-3 grid gap-2 min-[960px]:grid-cols-2 min-[1280px]:grid-cols-3">
        <MetaPill icon={Server} label="实例名称" mono value={item.name} />
        <MetaPill
          icon={Settings2}
          label="命名空间"
          mono
          value={item.namespace}
        />
        <MetaPill
          icon={HardDrive}
          label="工作目录"
          mono
          value={item.workingDir || template.workingDir}
        />
      </div>

      <div className="mt-3 grid min-w-0 gap-2.5 min-[1180px]:grid-cols-[minmax(360px,0.92fr)_minmax(380px,1.08fr)]">
        <SectionCard
          actions={
            <Button
              disabled={submitting}
              onClick={onSaveRuntime}
              size="sm"
              type="button"
            >
              {submitting ? "保存中..." : "保存运行时"}
            </Button>
          }
          description="容器规格"
          title="运行资源"
        >
          <div className="grid gap-2 min-[760px]:grid-cols-2">
            {RESOURCE_PRESETS.map((preset) => {
              const active = runtimeBlueprint.profile === preset.id;
              return (
                <button
                  className={cn(
                    "rounded-xl border px-2.5 py-2.5 text-left transition",
                    active
                      ? "border-zinc-900 bg-zinc-50 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                  )}
                  key={preset.id}
                  onClick={() => onRuntimePreset(preset.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-medium text-zinc-950">
                      {preset.label}
                    </span>
                    {active ? (
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px]/4 font-medium text-white">
                        当前
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[11px]/5 text-zinc-500">
                    {preset.description}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid gap-2 min-[760px]:grid-cols-3">
            <Input
              className="w-full"
              disabled={!runtimeIsCustomPreset}
              label="CPU"
              onChange={(event) => onRuntimeChange("cpu", event.target.value)}
              placeholder="例如 2000m"
              value={runtimeBlueprint.cpu}
            />
            <Input
              className="w-full"
              disabled={!runtimeIsCustomPreset}
              label="内存"
              onChange={(event) =>
                onRuntimeChange("memory", event.target.value)
              }
              placeholder="例如 4096Mi"
              value={runtimeBlueprint.memory}
            />
            <Input
              className="w-full"
              label="存储"
              onChange={(event) =>
                onRuntimeChange("storageLimit", event.target.value)
              }
              placeholder="例如 10Gi"
              value={runtimeBlueprint.storageLimit}
            />
          </div>

          <div className="mt-2.5 rounded-xl border-[0.5px] border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px]/5 text-zinc-500">
            当前运行环境为{" "}
            <span className="font-medium text-zinc-700">
              {item.contract.runtime.runtimeClassName || "devbox-runtime"}
            </span>
          </div>
        </SectionCard>

        <SectionCard
          actions={
            <Button
              disabled={submitting}
              onClick={onSaveSettings}
              size="sm"
              type="button"
            >
              {submitting ? "保存中..." : "保存 Agent 设置"}
            </Button>
          }
          description="模型与接入"
          title="Agent 配置"
        >
          <div className="flex flex-col gap-2.5">
            <Input
              className="w-full max-w-[360px]"
              label="别名"
              onChange={(event) =>
                onSettingsChange("aliasName", event.target.value)
              }
              placeholder="例如：客服助手"
              value={settingsBlueprint.aliasName}
            />

            {template.settings.agent.length > 0 ? (
              <div className="grid gap-2.5 min-[960px]:grid-cols-2">
                {template.settings.agent.map((field) => (
                  <div key={field.key}>{renderAgentField(field)}</div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border-[0.5px] border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[11px]/5 text-zinc-500">
                当前模板没有额外配置项。
              </div>
            )}
          </div>

        </SectionCard>
      </div>
    </div>
  );
}
