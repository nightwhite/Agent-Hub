import { useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { DeleteAgentModal } from "../../../components/business/agents/DeleteAgentModal";
import { AgentChatWorkspace } from "../../../components/business/chat/AgentChatWorkspace";
import { AgentFilesWorkspace } from "../../../components/business/files/AgentFilesWorkspace";
import { AgentWebUIWorkspace } from "../../../components/business/web-ui/AgentWebUIWorkspace";
import { writeBlueprintSettingValue } from "../../../domains/agents/blueprintFields";
import { createBlueprintFromAgentItem } from "../../../domains/agents/mappers";
import { createEmptyBlueprint } from "../../../domains/agents/templates";
import type {
  AgentBlueprint,
  AgentListItem,
} from "../../../domains/agents/types";
import { AgentDetailHeader } from "./components/AgentDetailHeader";
import { AgentDetailOverview } from "./components/AgentDetailOverview";
import { AgentSettingsWorkspace } from "./components/AgentSettingsWorkspace";
import {
  AgentDetailSidebar,
  type AgentDetailTab,
} from "./components/AgentDetailSidebar";
import { AgentPageHeader } from "./components/AgentPageHeader";
import { AgentHubOverview } from "./components/AgentHubOverview";
import { AgentWorkspaceShell } from "./components/AgentWorkspaceShell";
import { AGENT_HUB_DIALOG_CONTENT_CLASSNAME } from "./components/workspaceLayout";
import { useAgentHub } from "./hooks/AgentHubControllerContext";
import { useAgentChat } from "./hooks/useAgentChat";
import { useAgentFiles } from "./hooks/useAgentFiles";
import { applyBlueprintPreset, updateBlueprintField } from "./lib/blueprint";
import type { AgentDetailRouteState } from "./lib/navigation";
import { openAgentTerminalDesktopWindow } from "./lib/terminalWindow";

export function AgentDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { agentName = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const controller = useAgentHub();
  const { findItemByName, primeItem } = controller;
  const resolvingMissingRef = useRef(false);
  const [resolvingMissing, setResolvingMissing] = useState(false);
  const [runtimeEditingItem, setRuntimeEditingItem] =
    useState<AgentListItem | null>(null);
  const [settingsEditingItem, setSettingsEditingItem] =
    useState<AgentListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentListItem | null>(null);
  const [runtimeEditBlueprint, setRuntimeEditBlueprint] =
    useState<AgentBlueprint>(() => createEmptyBlueprint());
  const [settingsEditBlueprint, setSettingsEditBlueprint] =
    useState<AgentBlueprint>(() => createEmptyBlueprint());
  const navigationState = location.state as AgentDetailRouteState | null;

  const { chatSession, openChat, sendChatMessage, setChatDraft } = useAgentChat(
    {
      clusterContext: controller.clusterContext,
      onErrorMessage: controller.setMessage,
    },
  );

  const {
    closeFiles,
    createDirectory,
    createEmptyFile,
    deleteEntry,
    downloadEntry,
    editEntry,
    filesSession,
    jumpToPath,
    openEntry,
    openFiles,
    openParentDirectory,
    prefetchDirectory,
    refreshDirectory,
    saveSelectedFile,
    selectEntry,
    updateSelectedContent,
    uploadFiles,
  } = useAgentFiles({
    clusterContext: controller.clusterContext,
  });

  const navigationItem =
    navigationState?.agent?.name === agentName ? navigationState.agent : null;

  useEffect(() => {
    if (!navigationItem) return;
    primeItem(navigationItem);
  }, [navigationItem, primeItem]);

  const item = findItemByName(agentName) || navigationItem;

  useEffect(() => {
    if (!agentName || item || controller.loading || resolvingMissingRef.current) {
      return;
    }

    let cancelled = false;
    let pendingSleepTimer: number | null = null;
    let wakePendingSleep: (() => void) | null = null;
    resolvingMissingRef.current = true;
    setResolvingMissing(true);

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          if (pendingSleepTimer != null) {
            window.clearTimeout(pendingSleepTimer);
            pendingSleepTimer = null;
          }
          wakePendingSleep = null;
          resolve();
        };
        wakePendingSleep = finish;
        pendingSleepTimer = window.setTimeout(finish, ms);
      });

    const recoverItem = async () => {
      try {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const fetched = await controller.fetchAgentByName(agentName).catch(
            () => null,
          );
          if (fetched) {
            return;
          }
          await sleep(800);
          if (cancelled) {
            return;
          }
        }
      } finally {
        if (!cancelled) {
          setResolvingMissing(false);
        }
        resolvingMissingRef.current = false;
      }
    };

    void recoverItem();

    return () => {
      cancelled = true;
      resolvingMissingRef.current = false;
      setResolvingMissing(false);
      if (wakePendingSleep) {
        wakePendingSleep();
      } else if (pendingSleepTimer != null) {
        window.clearTimeout(pendingSleepTimer);
        pendingSleepTimer = null;
      }
    };
  }, [
    agentName,
    item,
    controller.loading,
    controller.fetchAgentByName,
  ]);

  const currentTab = useMemo<AgentDetailTab>(() => {
    const value = searchParams.get("tab");
    if (value === "chat" || value === "files" || value === "settings" || value === "web-ui") {
      return value;
    }
    return "overview";
  }, [searchParams]);

  const setCurrentTab = (tab: AgentDetailTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!item || currentTab !== "chat") return;
    if (chatSession?.resource.name === item.name) return;
    openChat(item);
  }, [chatSession?.resource.name, currentTab, item, openChat]);

  useEffect(() => {
    if (!item) return;

    if (currentTab === "files") {
      if (filesSession?.resource.name !== item.name) {
        openFiles(item);
      }
      return;
    }

    if (filesSession) {
      closeFiles();
    }
  }, [closeFiles, currentTab, filesSession, item, openFiles]);

  const closeRuntimeEditFlow = () => {
    setRuntimeEditingItem(null);
    setRuntimeEditBlueprint(createEmptyBlueprint());
  };

  const closeSettingsEditFlow = () => {
    setSettingsEditingItem(null);
    setSettingsEditBlueprint(createEmptyBlueprint());
  };

  const handleSubmitRuntime = async (
    targetItem: AgentListItem,
    nextBlueprint: AgentBlueprint,
  ) => {
    try {
      await controller.updateAgentRuntimeFromBlueprint(
        targetItem,
        nextBlueprint,
      );
      closeRuntimeEditFlow();
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "更新失败",
      );
    }
  };

  const handleSubmitSettings = async (
    targetItem: AgentListItem,
    nextBlueprint: AgentBlueprint,
  ) => {
    try {
      await controller.updateAgentSettingsFromBlueprint(
        targetItem,
        nextBlueprint,
      );
      closeSettingsEditFlow();
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "更新失败",
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await controller.deleteAgentItem(deleteTarget);
      navigate("/agents");
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "删除失败",
      );
    }
  };

  const handleToggleState = async () => {
    if (!item) return;

    try {
      await controller.toggleItemState(item);
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "切换运行状态失败",
      );
    }
  };

  const handleOpenTerminalWindow = async () => {
    if (!item) return;
    try {
      await openAgentTerminalDesktopWindow(item);
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "打开终端窗口失败",
      );
    }
  };

  const renderTabContent = () => {
    if (!item) return null;
    const runtimeBlueprint =
      runtimeEditingItem?.name === item.name
        ? runtimeEditBlueprint
        : createBlueprintFromAgentItem(item);
    const settingsBlueprint =
      settingsEditingItem?.name === item.name
        ? settingsEditBlueprint
        : createBlueprintFromAgentItem(item);

    switch (currentTab) {
      case "overview":
        return (
          <AgentDetailOverview
            clusterContext={controller.clusterContext}
            item={item}
            onErrorMessage={controller.setMessage}
          />
        );
      case "chat":
        return (
          <AgentChatWorkspace
            emptyDescription="打开后即可开始对话。"
            onDraftChange={setChatDraft}
            onOpen={() => openChat(item)}
            onSend={sendChatMessage}
            session={chatSession}
          />
        );
      case "files":
        return (
          <AgentFilesWorkspace
            onChangeContent={updateSelectedContent}
            onCreateDirectory={createDirectory}
            onCreateFile={createEmptyFile}
            onDelete={deleteEntry}
            onDownload={downloadEntry}
            onEditEntry={editEntry}
            onOpen={() => openFiles(item)}
            onSelectEntry={selectEntry}
            onOpenEntry={openEntry}
            onPrefetchDirectory={prefetchDirectory}
            onOpenParent={openParentDirectory}
            onJumpToPath={jumpToPath}
            onRefresh={refreshDirectory}
            onSave={() => void saveSelectedFile()}
            onUpload={uploadFiles}
            session={filesSession}
          />
        );
      case "settings":
        return (
          <AgentSettingsWorkspace
            item={item}
            onRuntimeChange={(field, value) => {
              setRuntimeEditingItem(item);
              setRuntimeEditBlueprint((current) => {
                const base =
                  current.appName === item.name ? current : runtimeBlueprint;
                return updateBlueprintField(base, field, value);
              });
            }}
            onRuntimePreset={(presetId) => {
              setRuntimeEditingItem(item);
              setRuntimeEditBlueprint((current) => {
                const base =
                  current.appName === item.name ? current : runtimeBlueprint;
                return applyBlueprintPreset(base, presetId);
              });
            }}
            onSaveRuntime={() =>
              void handleSubmitRuntime(item, runtimeBlueprint)
            }
            onSaveSettings={() =>
              void handleSubmitSettings(item, settingsBlueprint)
            }
            onSettingsChange={(field, value) => {
              setSettingsEditingItem(item);
              setSettingsEditBlueprint((current) => {
                const base =
                  current.appName === item.name ? current : settingsBlueprint;
                return updateBlueprintField(base, field, value);
              });
            }}
            onSettingsFieldChange={(field, value) => {
              setSettingsEditingItem(item);
              setSettingsEditBlueprint((current) => {
                const base =
                  current.appName === item.name ? current : settingsBlueprint;
                return writeBlueprintSettingValue(base, field, value);
              });
            }}
            runtimeBlueprint={runtimeBlueprint}
            settingsBlueprint={settingsBlueprint}
            submitting={controller.submitting}
            template={controller.findTemplateById(item.templateId)}
            workspaceModelBaseURL={controller.workspaceAIProxyModelBaseURL}
            workspaceModelKeyReady={Boolean(
              controller.workspaceAIProxyToken?.key,
            )}
            workspaceRegion={controller.workspaceRegion}
          />
        );
      case "web-ui":
        return (
          <AgentWebUIWorkspace
            reason={item.webUIAccess?.reason}
            url={
              item.webUIAccess?.url || item.workspacesByKey["web-ui"]?.url || ""
            }
          />
        );
    }
  };

  if ((controller.loading || resolvingMissing) && !item) {
    return (
      <AgentWorkspaceShell>
        <div className={`${AGENT_HUB_DIALOG_CONTENT_CLASSNAME} flex h-full min-w-0 flex-col`}>
          <div className="flex min-h-16 w-full items-center text-[13px]/5 text-zinc-500">
            正在载入实例详情...
          </div>
        </div>
      </AgentWorkspaceShell>
    );
  }

  if (!item) {
    return (
      <AgentWorkspaceShell>
        <div className={`${AGENT_HUB_DIALOG_CONTENT_CLASSNAME} flex h-full min-w-0 flex-col`}>
          <AgentPageHeader
            backLabel="返回 Agent 列表"
            backTo="/agents"
            title="实例不存在"
          />
          <main className="flex min-h-0 flex-1 flex-col gap-3 pb-6">
            <AgentHubOverview message={controller.message} />
            <div className="workbench-card-strong flex h-full min-h-[320px] flex-1 items-center justify-center px-6 py-16 text-center text-sm text-zinc-500">
              当前没有找到名为{" "}
              <span className="font-medium text-zinc-950">{agentName}</span> 的
              实例。
            </div>
          </main>
        </div>
      </AgentWorkspaceShell>
    );
  }

  return (
    <AgentWorkspaceShell>
      <div className={`${AGENT_HUB_DIALOG_CONTENT_CLASSNAME} flex h-full min-w-0 flex-col`}>
        <AgentDetailHeader
          item={item}
          onBack={() => navigate("/agents")}
          onDelete={() => setDeleteTarget(item)}
          onOpenChat={() => setCurrentTab("chat")}
          onOpenConfig={() => setCurrentTab("settings")}
          onOpenWebUI={() => setCurrentTab("web-ui")}
          onOpenTerminalWindow={() => void handleOpenTerminalWindow()}
          onToggleState={handleToggleState}
        />

        <main className="flex min-h-0 flex-1 flex-col gap-2 pb-4">
          <AgentHubOverview message={controller.message} />

          <div className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-hidden">
            <AgentDetailSidebar
              currentTab={currentTab}
              item={item}
              onTabChange={setCurrentTab}
            />
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              {renderTabContent()}
            </div>
          </div>
        </main>

        <DeleteAgentModal
          item={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          open={Boolean(deleteTarget)}
          submitting={controller.deleting}
        />
      </div>
    </AgentWorkspaceShell>
  );
}
