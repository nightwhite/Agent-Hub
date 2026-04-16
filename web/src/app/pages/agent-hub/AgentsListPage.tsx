import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgentConfigModal } from '../../../components/business/agents/AgentConfigModal'
import { DeleteAgentModal } from '../../../components/business/agents/DeleteAgentModal'
import { AgentInstancesTable } from '../../../components/business/agents/AgentInstancesTable'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { AgentCapabilityOverlays } from './components/AgentCapabilityOverlays'
import { AgentHubHeader } from './components/AgentHubHeader'
import { AgentHubOverview } from './components/AgentHubOverview'
import { AgentWorkspaceShell } from './components/AgentWorkspaceShell'
import { useAgentHubController } from './hooks/useAgentHubController'
import { useAgentChat } from './hooks/useAgentChat'
import { useAgentFiles } from './hooks/useAgentFiles'
import { useAgentTerminal } from './hooks/useAgentTerminal'
import { applyBlueprintPreset, updateBlueprintField } from './lib/blueprint'
import { openAgentTerminalDesktopWindow } from './lib/terminalWindow'
import { createBlueprintFromAgentItem } from '../../../domains/agents/mappers'
import { DEFAULT_TEMPLATE_ID, EMPTY_BLUEPRINT } from '../../../domains/agents/templates'
import type { AgentBlueprint, AgentListItem, AgentTemplateId } from '../../../domains/agents/types'

export function AgentsListPage() {
  const navigate = useNavigate()
  const controller = useAgentHubController()
  const [keyword, setKeyword] = useState('')
  const [editingItem, setEditingItem] = useState<AgentListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AgentListItem | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<AgentTemplateId>(DEFAULT_TEMPLATE_ID)
  const [editBlueprint, setEditBlueprint] = useState<AgentBlueprint>({ ...EMPTY_BLUEPRINT })

  const {
    chatSession,
    closeChat,
    openChat,
    sendChatMessage,
    setChatDraft,
  } = useAgentChat({
    clusterContext: controller.clusterContext,
    onErrorMessage: controller.setMessage,
  })

  const {
    closeTerminal,
    markTerminalConnected,
    markTerminalError,
    openTerminal,
    resizeTerminal,
    sendTerminalInput,
    subscribeTerminalOutput,
    terminalSession,
  } = useAgentTerminal({
    clusterContext: controller.clusterContext,
    onErrorMessage: controller.setMessage,
  })

  const {
    closeFiles,
    createDirectory,
    createEmptyFile,
    deleteEntry,
    downloadEntry,
    filesSession,
    listDirectory,
    openEntry,
    openFiles,
    openParentDirectory,
    saveSelectedFile,
    updateSelectedContent,
    uploadFiles,
  } = useAgentFiles({
    clusterContext: controller.clusterContext,
  })

  const filteredItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return controller.items

    return controller.items.filter((item) =>
      [
        item.name,
        item.aliasName,
        item.namespace,
        item.template.name,
        item.model,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    )
  }, [controller.items, keyword])

  const openEditFlow = (item: AgentListItem) => {
    setEditingItem(item)
    setSelectedTemplateId(item.templateId)
    setEditBlueprint(createBlueprintFromAgentItem(item))
  }

  const closeEditFlow = () => {
    setEditingItem(null)
    setSelectedTemplateId(DEFAULT_TEMPLATE_ID)
    setEditBlueprint({ ...EMPTY_BLUEPRINT })
  }

  const handleBlueprintChange = (field: keyof AgentBlueprint, value: string) => {
    setEditBlueprint((current) => updateBlueprintField(current, field, value))
  }

  const handleSelectPreset = (presetId: AgentBlueprint['profile']) => {
    setEditBlueprint((current) => applyBlueprintPreset(current, presetId))
  }

  const handleSubmitEdit = async () => {
    if (!editingItem) return

    try {
      await controller.updateAgentFromBlueprint(editingItem, editBlueprint)
      closeEditFlow()
    } catch (error) {
      controller.setMessage(error instanceof Error ? error.message : '提交失败')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      await controller.deleteAgentItem(deleteTarget)
      setDeleteTarget(null)
    } catch (error) {
      controller.setMessage(error instanceof Error ? error.message : '删除失败')
    }
  }

  const handleToggleState = async (item: AgentListItem) => {
    try {
      await controller.toggleItemState(item)
    } catch (error) {
      controller.setMessage(error instanceof Error ? error.message : '切换运行状态失败')
    }
  }

  const handleOpenTerminal = async (item: AgentListItem) => {
    try {
      await openAgentTerminalDesktopWindow(item)
    } catch {
      openTerminal(item)
    }
  }

  return (
    <AgentWorkspaceShell>
      <div className="flex h-full flex-col px-12">
        <AgentHubHeader
          keyword={keyword}
          namespace={controller.clusterInfo?.namespace}
          onBrowseTemplates={() => navigate('/agents/templates')}
          onCreate={() => navigate('/agents/templates')}
          onKeywordChange={setKeyword}
          operator={controller.clusterInfo?.operator || 'Sealos'}
        />

        <main className="flex min-h-0 flex-1 flex-col gap-3 pb-6">
          <AgentHubOverview message={controller.message} />

          {controller.loading ? (
            <div className="flex h-full min-h-[320px] flex-1 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center text-sm text-zinc-500 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
              正在加载 Agent 实例...
            </div>
          ) : filteredItems.length === 0 && controller.items.length > 0 ? (
            <EmptyState
              action={
                <Button onClick={() => setKeyword('')} type="button" variant="secondary">
                  清空搜索
                </Button>
              }
              description="没有找到匹配的实例，试试更换关键词或清空搜索条件。"
              title="没有相关 Agent 实例"
            />
          ) : (
            <AgentInstancesTable
              items={filteredItems}
              onChat={openChat}
              onCreate={() => navigate('/agents/templates')}
              onDelete={setDeleteTarget}
              onEdit={openEditFlow}
              onFiles={openFiles}
              onOpenDetail={(item) => navigate(`/agents/${item.name}`)}
              onTerminal={handleOpenTerminal}
              onToggleState={handleToggleState}
            />
          )}
        </main>
      </div>

      <AgentConfigModal
        blueprint={editBlueprint}
        mode="edit"
        onChange={handleBlueprintChange}
        onClose={closeEditFlow}
        onSelectPreset={handleSelectPreset}
        onSubmit={handleSubmitEdit}
        open={Boolean(editingItem)}
        submitting={controller.submitting}
        templateId={selectedTemplateId}
        workspaceModelBaseURL={controller.workspaceAIProxyModelBaseURL}
        workspaceModelKey={controller.workspaceAIProxyToken?.key || ''}
        workspaceModelKeyReady={Boolean(controller.workspaceAIProxyToken?.key)}
      />

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
        onCloseTerminal={closeTerminal}
        onCreateDirectory={createDirectory}
        onCreateFile={createEmptyFile}
        onDeleteFile={deleteEntry}
        onDownloadFile={downloadEntry}
        onOpenFileEntry={openEntry}
        onOpenParentDirectory={openParentDirectory}
        onRefreshFiles={() => void listDirectory()}
        onSaveFile={() => void saveSelectedFile()}
        onSendChat={sendChatMessage}
        onTerminalAttachOutput={subscribeTerminalOutput}
        onTerminalError={markTerminalError}
        onTerminalInput={sendTerminalInput}
        onTerminalReady={markTerminalConnected}
        onTerminalResize={resizeTerminal}
        onUploadFiles={uploadFiles}
        terminalSession={terminalSession}
      />
    </AgentWorkspaceShell>
  )
}
