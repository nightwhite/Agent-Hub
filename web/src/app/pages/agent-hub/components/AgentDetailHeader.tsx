import {
  ArrowLeft,
  Bot,
  Globe,
  PauseCircle,
  PlayCircle,
  Settings,
  Terminal,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../../../components/ui/Button";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import type { AgentListItem } from "../../../../domains/agents/types";

interface AgentDetailHeaderProps {
  item: AgentListItem;
  onBack: () => void;
  onOpenTerminalWindow: () => void;
  onDelete: () => void;
  onOpenChat: () => void;
  onOpenConfig: () => void;
  onOpenWebUI: () => void;
  onToggleState: () => void;
  extraActions?: ReactNode;
}

export function AgentDetailHeader({
  item,
  onBack,
  onOpenTerminalWindow,
  onDelete,
  onOpenChat,
  onOpenConfig,
  onOpenWebUI,
  onToggleState,
  extraActions,
}: AgentDetailHeaderProps) {
  const toggleLabel = item.status === "running" ? "暂停" : "启动";
  const toggleDisabled = item.status === "creating";
  const toggleTitle = toggleDisabled
    ? "实例创建中，暂时不可切换状态"
    : toggleLabel;
  const primaryAction = item.chatAvailable
    ? {
        label: "对话",
        icon: Bot,
        onClick: onOpenChat,
        disabled: false,
        title: "对话",
      }
    : item.webUIAvailable
      ? {
          label: "Web UI",
          icon: Globe,
          onClick: onOpenWebUI,
          disabled: false,
          title: "打开 Web UI 工作台",
        }
      : item.terminalAvailable
        ? {
            label: "终端",
            icon: Terminal,
            onClick: onOpenTerminalWindow,
            disabled: false,
            title: "打开终端窗口",
          }
        : {
            label: "设置",
            icon: Settings,
            onClick: onOpenConfig,
            disabled: false,
            title: "打开设置",
          };

  return (
    <header className="flex min-h-[72px] w-full items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          onClick={onBack}
          title="返回 Agent 列表"
          type="button"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-[1.28rem]/7 font-semibold tracking-[-0.028em] text-zinc-950">
            {item.aliasName || item.name}
          </div>
          <StatusBadge status={item.status} />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {extraActions}

        <Button
          className="w-9 bg-white px-0 text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          onClick={onDelete}
          size="md"
          title="删除"
          type="button"
          variant="secondary"
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        <Button
          className="w-9 bg-white px-0 text-zinc-500 hover:text-zinc-900"
          disabled={!item.terminalAvailable}
          onClick={onOpenTerminalWindow}
          size="md"
          title={
            item.terminalAvailable
              ? "打开终端窗口"
              : item.terminalDisabledReason || "终端不可用"
          }
          type="button"
          variant="secondary"
        >
          <Terminal className="h-4 w-4" />
        </Button>

        <div className="flex items-center rounded-xl border-[0.5px] border-zinc-200 bg-white p-0.5 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
          <Button
            className="rounded-[10px] border-0 shadow-none"
            disabled={toggleDisabled}
            onClick={onToggleState}
            size="sm"
            title={toggleTitle}
            type="button"
            variant="secondary"
          >
            {item.status === "running" ? (
              <PauseCircle className="h-4 w-4" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            {toggleLabel}
          </Button>
          <Button
            className="rounded-[10px] border-0 shadow-none"
            onClick={onOpenConfig}
            size="sm"
            title="配置"
            type="button"
            variant="secondary"
          >
            <Settings className="h-4 w-4" />
            配置
          </Button>
        </div>

        <Button
          className="min-w-[82px] bg-zinc-900 text-white shadow-[0_1px_2px_rgba(24,24,27,0.14)] hover:bg-zinc-800"
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
          size="md"
          title={primaryAction.title}
          type="button"
          variant="primary"
        >
          <primaryAction.icon className="h-4 w-4" />
          {primaryAction.label}
        </Button>
      </div>
    </header>
  );
}
