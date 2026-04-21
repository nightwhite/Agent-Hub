import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DeleteAgentModal } from "../../../components/business/agents/DeleteAgentModal";
import { AgentInstancesTable } from "../../../components/business/agents/AgentInstancesTable";
import { AgentCapabilityOverlays } from "./components/AgentCapabilityOverlays";
import { AgentHubHeader } from "./components/AgentHubHeader";
import { AgentListHeroEmpty } from "./components/AgentListHeroEmpty";
import { AgentHubOverview } from "./components/AgentHubOverview";
import { AgentWorkspaceShell } from "./components/AgentWorkspaceShell";
import { AGENT_HUB_DIALOG_CONTENT_CLASSNAME } from "./components/workspaceLayout";
import { useAgentHub } from "./hooks/AgentHubControllerContext";
import { useAgentChat } from "./hooks/useAgentChat";
import { useAgentFiles } from "./hooks/useAgentFiles";
import { buildAgentDetailRouteState } from "./lib/navigation";
import { openAgentTerminalDesktopWindow } from "./lib/terminalWindow";
import type { AgentListItem } from "../../../domains/agents/types";

export function AgentsListPage() {
  const navigate = useNavigate();
  const controller = useAgentHub();
  const [keyword, setKeyword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AgentListItem | null>(null);

  const { chatSession, closeChat, openChat, sendChatMessage, setChatDraft } =
    useAgentChat({
      clusterContext: controller.clusterContext,
      onErrorMessage: controller.setMessage,
    });

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

  const filteredItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return controller.items;

    return controller.items.filter((item) =>
      [
        item.name,
        item.aliasName,
        item.namespace,
        item.template.name,
        item.model,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [controller.items, keyword]);

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await controller.deleteAgentItem(deleteTarget);
      setDeleteTarget(null);
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "删除失败",
      );
    }
  };

  const handleToggleState = async (item: AgentListItem) => {
    try {
      await controller.toggleItemState(item);
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "切换运行状态失败",
      );
    }
  };

  const handleOpenTerminal = async (item: AgentListItem) => {
    try {
      await openAgentTerminalDesktopWindow(item);
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "打开终端窗口失败",
      );
    }
  };

  const handleOpenWebUI = (item: AgentListItem) => {
    if (!item.webUIAccess?.enabled) {
      controller.setMessage(
        item.webUIAccess?.reason || "当前模板没有可用的 Web UI 地址",
      );
      return;
    }
    navigate(`/agents/${item.name}?tab=web-ui`, {
      state: buildAgentDetailRouteState(item, "list"),
    });
  };

  return (
    <AgentWorkspaceShell>
      <div className={`${AGENT_HUB_DIALOG_CONTENT_CLASSNAME} flex h-full min-w-0 flex-col`}>
        <AgentHubHeader
          keyword={keyword}
          namespace={controller.clusterInfo?.namespace}
          onBrowseTemplates={() => navigate("/agents/templates")}
          onCreate={() => navigate("/agents/templates")}
          onKeywordChange={setKeyword}
          operator={controller.clusterInfo?.operator || "Sealos"}
        />

        <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-6">
          <AgentHubOverview message={controller.message} />

          {controller.loading ? (
            <div className="workbench-card-strong flex h-full min-h-[320px] flex-1 items-center justify-center px-6 py-16 text-center text-sm text-zinc-500">
              正在载入实例列表...
            </div>
          ) : filteredItems.length === 0 && controller.items.length > 0 ? (
            <AgentListHeroEmpty mode="search" onAction={() => setKeyword("")} />
          ) : filteredItems.length === 0 ? (
            <AgentListHeroEmpty
              mode="create"
              onAction={() => navigate("/agents/templates")}
            />
          ) : (
            <AgentInstancesTable
              items={filteredItems}
              onChat={openChat}
              onDelete={setDeleteTarget}
              onEdit={(item) =>
                navigate(`/agents/${item.name}?tab=settings`, {
                  state: buildAgentDetailRouteState(item, "list"),
                })
              }
              onFiles={openFiles}
              onOpenDetail={(item) =>
                navigate(`/agents/${item.name}`, {
                  state: buildAgentDetailRouteState(item, "list"),
                })
              }
              onTerminal={handleOpenTerminal}
              onToggleState={handleToggleState}
              onWebUI={handleOpenWebUI}
            />
          )}
        </main>
      </div>

      <DeleteAgentModal
        item={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        open={Boolean(deleteTarget)}
        submitting={controller.deleting}
      />

      <AgentCapabilityOverlays
        chatSession={chatSession}
        filesSession={filesSession}
        onChangeFileContent={updateSelectedContent}
        onChatDraftChange={setChatDraft}
        onCloseChat={closeChat}
        onCloseFiles={closeFiles}
        onCreateDirectory={createDirectory}
        onCreateFile={createEmptyFile}
        onDeleteFile={deleteEntry}
        onDownloadFile={downloadEntry}
        onEditFileEntry={editEntry}
        onSelectFileEntry={selectEntry}
        onOpenFileEntry={openEntry}
        onPrefetchDirectory={prefetchDirectory}
        onOpenParentDirectory={openParentDirectory}
        onOpenPath={jumpToPath}
        onRefreshFiles={refreshDirectory}
        onSaveFile={() => void saveSelectedFile()}
        onSendChat={sendChatMessage}
        onUploadFiles={uploadFiles}
      />
    </AgentWorkspaceShell>
  );
}
