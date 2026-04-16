import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AgentConfigModal } from '../../../components/business/agents/AgentConfigModal'
import { DeleteAgentModal } from '../../../components/business/agents/DeleteAgentModal'
import { AgentChatWorkspace } from '../../../components/business/chat/AgentChatWorkspace'
import { AgentFilesWorkspace } from '../../../components/business/files/AgentFilesWorkspace'
import { AgentTerminalWorkspace } from '../../../components/business/terminal/AgentTerminalWorkspace'
import { createBlueprintFromAgentItem } from '../../../domains/agents/mappers'
import { DEFAULT_TEMPLATE_ID, EMPTY_BLUEPRINT } from '../../../domains/agents/templates'
import type { AgentBlueprint, AgentListItem } from '../../../domains/agents/types'
import { AgentDetailHeader } from './components/AgentDetailHeader'
import { AgentDetailOverview } from './components/AgentDetailOverview'
import { AgentDetailSidebar, type AgentDetailTab } from './components/AgentDetailSidebar'
import { AgentPageHeader } from './components/AgentPageHeader'
import { AgentHubOverview } from './components/AgentHubOverview'
import { AgentWorkspaceShell } from './components/AgentWorkspaceShell'
import { useAgentHubController } from './hooks/useAgentHubController'
import { useAgentChat } from './hooks/useAgentChat'
import { useAgentFiles } from './hooks/useAgentFiles'
import { useAgentTerminal } from './hooks/useAgentTerminal'
import { applyBlueprintPreset, updateBlueprintField } from './lib/blueprint'
import { openAgentTerminalDesktopWindow } from './lib/terminalWindow'

export function AgentDetailPage() {
  const navigate = useNavigate()
  const { agentName = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const controller = useAgentHubController()
  const [editingItem, setEditingItem] = useState<AgentListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AgentListItem | null>(null)
  const [editBlueprint, setEditBlueprint] = useState<AgentBlueprint>({ ...EMPTY_BLUEPRINT })

  const {
    chatSession,
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

  const item = useMemo(
    () => controller.findItemByName(agentName),
    [agentName, controller.findItemByName],
  )

  const currentTab = useMemo<AgentDetailTab>(() => {
    const value = searchParams.get('tab')
    if (value === 'chat' || value === 'terminal' || value === 'files') {
      return value
    }
    return 'overview'
  }, [searchParams])

  const setCurrentTab = (tab: AgentDetailTab) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (!item || currentTab !== 'chat') return
    if (chatSession?.resource.name === item.name) return
    openChat(item)
  }, [chatSession?.resource.name, currentTab, item, openChat])

  useEffect(() => {
    if (!item) return

    if (currentTab === 'terminal') {
      if (terminalSession?.resource.name !== item.name) {
        openTerminal(item)
      }
      return
    }

    if (terminalSession) {
      closeTerminal()
    }
  }, [closeTerminal, currentTab, item, openTerminal, terminalSession])

  useEffect(() => {
    if (!item) return

    if (currentTab === 'files') {
      if (filesSession?.resource.name !== item.name) {
        openFiles(item)
      }
      return
    }

    if (filesSession) {
      closeFiles()
    }
  }, [closeFiles, currentTab, filesSession, item, openFiles])

  const openEditFlow = (resource: AgentListItem) => {
    setEditingItem(resource)
    setEditBlueprint(createBlueprintFromAgentItem(resource))
  }

  const closeEditFlow = () => {
    setEditingItem(null)
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
      controller.setMessage(error instanceof Error ? error.message : '更新失败')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      await controller.deleteAgentItem(deleteTarget)
      navigate('/agents')
    } catch (error) {
      controller.setMessage(error instanceof Error ? error.message : '删除失败')
    }
  }

  const handleToggleState = async () => {
    if (!item) return

    try {
      await controller.toggleItemState(item)
    } catch (error) {
      controller.setMessage(error instanceof Error ? error.message : '切换运行状态失败')
    }
  }

  const handleOpenTerminalWindow = async () => {
    if (!item) return
    try {
      await openAgentTerminalDesktopWindow(item)
    } catch {
      setCurrentTab('terminal')
    }
  }

  const renderTabContent = () => {
    if (!item) return null

    switch (currentTab) {
      case 'overview':
        return <AgentDetailOverview item={item} />
      case 'chat':
        return (
          <AgentChatWorkspace
            emptyDescription="进入对话页后会自动初始化当前 Agent 的会话，你可以直接在这里进行功能验证。"
            onDraftChange={setChatDraft}
            onOpen={() => openChat(item)}
            onSend={sendChatMessage}
            session={chatSession}
          />
        )
      case 'terminal':
        return (
          <AgentTerminalWorkspace
            onAttachOutput={subscribeTerminalOutput}
            onError={markTerminalError}
            onInput={sendTerminalInput}
            onOpen={() => openTerminal(item)}
            onReady={markTerminalConnected}
            onResize={resizeTerminal}
            session={terminalSession}
          />
        )
      case 'files':
        return (
          <AgentFilesWorkspace
            onChangeContent={updateSelectedContent}
            onCreateDirectory={createDirectory}
            onCreateFile={createEmptyFile}
            onDelete={deleteEntry}
            onDownload={downloadEntry}
            onOpen={() => openFiles(item)}
            onOpenEntry={openEntry}
            onOpenParent={openParentDirectory}
            onRefresh={() => void listDirectory()}
            onSave={() => void saveSelectedFile()}
            onUpload={uploadFiles}
            session={filesSession}
          />
        )
    }
  }

  if (controller.loading && !item) {
    return (
      <AgentWorkspaceShell>
        <div className="flex h-full min-w-[1200px] flex-col px-6">
          <div className="flex min-h-20 w-full items-center text-sm text-zinc-500">
            正在加载 Agent 详情...
          </div>
        </div>
      </AgentWorkspaceShell>
    )
  }

  if (!item) {
    return (
      <AgentWorkspaceShell>
        <div className="flex h-full min-w-[1200px] flex-col px-6">
          <AgentPageHeader
            backLabel="返回 Agent 列表"
            backTo="/agents"
            title="实例不存在"
          />
          <main className="flex min-h-0 flex-1 flex-col gap-3 pb-6">
            <AgentHubOverview message={controller.message} />
            <div className="flex h-full min-h-[320px] flex-1 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center text-sm text-zinc-500 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
              当前没有找到名为 <span className="font-medium text-zinc-950">{agentName}</span> 的 Agent。
            </div>
          </main>
        </div>
      </AgentWorkspaceShell>
    )
  }

  return (
    <AgentWorkspaceShell>
      <div className="flex h-full min-w-[1200px] flex-col px-6">
        <AgentDetailHeader
          item={item}
          onBack={() => navigate('/agents')}
          onDelete={() => setDeleteTarget(item)}
          onOpenChat={() => setCurrentTab('chat')}
          onOpenConfig={() => openEditFlow(item)}
          onOpenFiles={() => setCurrentTab('files')}
          onOpenTerminalWindow={() => void handleOpenTerminalWindow()}
          onToggleState={handleToggleState}
        />

        <main className="flex min-h-0 flex-1 flex-col gap-2 pb-6">
          <AgentHubOverview message={controller.message} />

          <div className="flex min-h-0 flex-1 gap-2">
            <AgentDetailSidebar currentTab={currentTab} onTabChange={setCurrentTab} />
            <div className="min-w-0 flex-1">{renderTabContent()}</div>
          </div>
        </main>

        <AgentConfigModal
          blueprint={editBlueprint}
          mode="edit"
          onChange={handleBlueprintChange}
          onClose={closeEditFlow}
          onSelectPreset={handleSelectPreset}
          onSubmit={handleSubmitEdit}
          open={Boolean(editingItem)}
          submitting={controller.submitting}
          templateId={editingItem?.templateId || DEFAULT_TEMPLATE_ID}
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
      </div>
    </AgentWorkspaceShell>
  )
}
