import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createAgent,
  deriveAIProxyModelBaseURL,
  createClusterContext,
  deleteAgent,
  ensureAIProxyToken,
  getClusterInfo,
  getCreateBlueprint,
  listAgents,
  pauseAgent,
  runAgent,
  updateAgent,
} from '../../api'
import { AgentConfigModal } from '../../components/business/agents/AgentConfigModal'
import { DeleteAgentModal } from '../../components/business/agents/DeleteAgentModal'
import { AgentInstancesTable } from '../../components/business/agents/AgentInstancesTable'
import { AgentTemplatePickerModal } from '../../components/business/agents/AgentTemplatePickerModal'
import { AgentChatModal } from '../../components/business/chat/AgentChatModal'
import { AgentTerminalModal } from '../../components/business/terminal/AgentTerminalModal'
import {
  applyTemplateToBlueprint,
  DEFAULT_TEMPLATE_ID,
  EMPTY_BLUEPRINT,
  RESOURCE_PRESETS,
  resolveResourcePreset,
  resolveTemplateById,
} from '../../domains/agents/templates'
import {
  createBlueprintFromAgentItem,
  ensureDns1035Name,
  mapBackendAgentsToListItems,
} from '../../domains/agents/mappers'
import type {
  AgentBlueprint,
  AgentListItem,
  AgentTemplateId,
  ClusterContext,
  ClusterInfo,
  WorkspaceAIProxyToken,
} from '../../domains/agents/types'
import { getSealosSession } from '../../sealosSdk'
import { AgentHubHeader } from './agent-hub/components/AgentHubHeader'
import { AgentHubOverview } from './agent-hub/components/AgentHubOverview'
import { useAgentChat } from './agent-hub/hooks/useAgentChat'
import { useAgentTerminal } from './agent-hub/hooks/useAgentTerminal'

const WORKSPACE_AIPROXY_TOKEN_NAME = 'Agent-Hub'

export function AgentHubPage() {
  const [items, setItems] = useState<AgentListItem[]>([])
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null)
  const [clusterContext, setClusterContext] = useState<ClusterContext | null>(null)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<AgentTemplateId>(DEFAULT_TEMPLATE_ID)
  const [configMode, setConfigMode] = useState<'create' | 'edit'>('create')
  const [blueprint, setBlueprint] = useState<AgentBlueprint>({ ...EMPTY_BLUEPRINT })
  const [editingItem, setEditingItem] = useState<AgentListItem | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AgentListItem | null>(null)
  const [workspaceAIProxyToken, setWorkspaceAIProxyToken] = useState<WorkspaceAIProxyToken | null>(null)

  const {
    chatSession,
    closeChat,
    openChat,
    sendChatMessage,
    setChatDraft,
  } = useAgentChat({
    clusterContext,
    onErrorMessage: setMessage,
  })

  const {
    closeTerminal,
    openTerminal,
    terminalContainerRef,
    terminalSession,
  } = useAgentTerminal({
    clusterContext,
  })

  const filteredItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return items

    return items.filter((item) =>
      [
        item.name,
        item.aliasName,
        item.namespace,
        item.template.name,
        item.apiUrl,
        item.modelProvider,
        item.modelBaseURL,
        item.model,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    )
  }, [items, keyword])

  const workspaceAIProxyModelBaseURL = useMemo(
    () => deriveAIProxyModelBaseURL(clusterContext?.server || clusterInfo?.server || ''),
    [clusterContext?.server, clusterInfo?.server],
  )

  const getAgentLabel = useCallback((aliasName: string, agentName: string) => {
    const displayName = aliasName.trim()
    if (!displayName || displayName === agentName) {
      return agentName
    }
    return `${displayName} (${agentName})`
  }, [])

  const toWorkspaceAIProxyToken = useCallback((payload: any): WorkspaceAIProxyToken | null => {
    if (!payload?.token) {
      return null
    }

    return {
      id: Number(payload.token.id || 0),
      name: String(payload.token.name || ''),
      key: String(payload.token.key || ''),
      status: Number(payload.token.status || 0),
      existed: Boolean(payload.existed),
    }
  }, [])

  const ensureWorkspaceTokenReady = useCallback(
    async (context: ClusterContext) => {
      const existingToken = workspaceAIProxyToken?.key ? workspaceAIProxyToken : null
      if (existingToken) {
        return existingToken
      }

      const ensuredToken = toWorkspaceAIProxyToken(
        await ensureAIProxyToken(context, { name: WORKSPACE_AIPROXY_TOKEN_NAME }),
      )

      if (!ensuredToken?.key) {
        throw new Error('未获取到 Agent-Hub AIProxy Key，暂时无法配置 Hermes Agent')
      }

      setWorkspaceAIProxyToken(ensuredToken)
      return ensuredToken
    },
    [toWorkspaceAIProxyToken, workspaceAIProxyToken],
  )

  const loadAll = useCallback(async ({ ensureWorkspaceToken = false }: { ensureWorkspaceToken?: boolean } = {}) => {
    setLoading(true)

    try {
      const session = await getSealosSession().catch(() => null)
      const nextClusterContext = createClusterContext(session)
      const [nextClusterInfo, response, nextWorkspaceToken] = await Promise.all([
        getClusterInfo(nextClusterContext),
        listAgents(nextClusterContext),
        ensureWorkspaceToken
          ? ensureAIProxyToken(nextClusterContext, { name: WORKSPACE_AIPROXY_TOKEN_NAME }).catch((error) => {
              console.warn('[aiproxy] ensure workspace token failed', {
                message: error instanceof Error ? error.message : String(error || ''),
              })
              return null
            })
          : Promise.resolve(null),
      ])

      setClusterContext(nextClusterContext)
      setClusterInfo(nextClusterInfo)
      setItems(mapBackendAgentsToListItems(response?.items || [], nextClusterInfo))

      if (ensureWorkspaceToken) {
        setWorkspaceAIProxyToken(toWorkspaceAIProxyToken(nextWorkspaceToken))
      }

      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [toWorkspaceAIProxyToken])

  useEffect(() => {
    loadAll({ ensureWorkspaceToken: true })
  }, [loadAll])

  const openCreateFlow = useCallback(() => {
    setConfigMode('create')
    setEditingItem(null)
    setSelectedTemplateId(DEFAULT_TEMPLATE_ID)
    setBlueprint({ ...EMPTY_BLUEPRINT })
    setShowTemplatePicker(true)
  }, [])

  const closeConfigModal = useCallback(() => {
    setShowConfigModal(false)
    setEditingItem(null)
    setConfigMode('create')
    setBlueprint({ ...EMPTY_BLUEPRINT })
    setSelectedTemplateId(DEFAULT_TEMPLATE_ID)
  }, [])

  const proceedCreateFlow = useCallback(async () => {
    if (!clusterContext) {
      setMessage('缺少集群上下文，无法创建 Agent。')
      return
    }

    const template = resolveTemplateById(selectedTemplateId)
    if (!template.backendSupported) {
      setMessage(template.createDisabledReason || '当前模板暂未接入后端管理 API。')
      return
    }

    try {
      const seed = getCreateBlueprint(clusterContext, undefined, [])
      const safeAppName = ensureDns1035Name(seed.appName, 'agent')
      const ensuredWorkspaceToken = await ensureWorkspaceTokenReady(clusterContext)
      const resolvedWorkspaceModelBaseURL = workspaceAIProxyModelBaseURL

      setBlueprint({
        ...applyTemplateToBlueprint(
          {
            ...seed,
            appName: safeAppName,
            aliasName: '',
            state: seed.state === 'Paused' ? 'Paused' : 'Running',
            serviceType: 'ClusterIP',
            protocol: 'TCP',
          },
          selectedTemplateId,
        ),
        modelProvider: 'openai',
        modelBaseURL: resolvedWorkspaceModelBaseURL,
        hasModelAPIKey: Boolean(ensuredWorkspaceToken.key),
      })
      setShowTemplatePicker(false)
      setShowConfigModal(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载创建模板失败')
    }
  }, [clusterContext, ensureWorkspaceTokenReady, selectedTemplateId, workspaceAIProxyModelBaseURL])

  const openEditFlow = useCallback((item: AgentListItem) => {
    setConfigMode('edit')
    setEditingItem(item)
    setSelectedTemplateId(item.templateId)
    setBlueprint(createBlueprintFromAgentItem(item))
    setShowConfigModal(true)
  }, [])

  const handleBlueprintChange = useCallback((field: keyof AgentBlueprint, value: string) => {
    setBlueprint((current) => {
      const next = { ...current, [field]: value }

      if (field === 'cpu' || field === 'memory') {
        next.profile = resolveResourcePreset(field === 'cpu' ? value : next.cpu, field === 'memory' ? value : next.memory)
      }

      return next
    })
  }, [])

  const handleSelectPreset = useCallback((presetId: AgentBlueprint['profile']) => {
    setBlueprint((current) => {
      const preset = RESOURCE_PRESETS.find((item) => item.id === presetId)
      if (!preset) return current
      if (presetId === 'custom') {
        return {
          ...current,
          profile: 'custom',
        }
      }

      return {
        ...current,
        profile: preset.id,
        cpu: preset.cpu,
        memory: preset.memory,
      }
    })
  }, [])

  const buildCreatePayload = useCallback(
    (source: AgentBlueprint, modelAPIKey: string) => ({
      'agent-name': ensureDns1035Name(source.appName, 'agent'),
      'agent-cpu': source.cpu,
      'agent-memory': source.memory,
      'agent-storage': source.storageLimit,
      'agent-model-provider': source.modelProvider.trim(),
      'agent-model-baseurl': source.modelBaseURL.trim(),
      'agent-model-apikey': modelAPIKey,
      'agent-model': source.model.trim(),
      'agent-alias-name': source.aliasName.trim(),
    }),
    [],
  )

  const buildUpdatePayload = useCallback((source: AgentBlueprint) => ({
    'agent-cpu': source.cpu,
    'agent-memory': source.memory,
    'agent-storage': source.storageLimit,
    'agent-model-provider': source.modelProvider.trim(),
    'agent-model-baseurl': source.modelBaseURL.trim(),
    'agent-model': source.model.trim(),
    'agent-alias-name': source.aliasName.trim(),
  }), [])

  const handleSubmit = useCallback(async () => {
    if (!clusterContext) {
      setMessage('缺少集群上下文，无法提交')
      return
    }

    const aliasName = blueprint.aliasName.trim()
    if (!aliasName) {
      setMessage('请填写 Agent 别名')
      return
    }

    setSubmitting(true)

    try {
      const nextBlueprint = {
        ...blueprint,
        appName: ensureDns1035Name(blueprint.appName, 'agent'),
        aliasName,
        modelProvider: 'openai',
        modelBaseURL: workspaceAIProxyModelBaseURL || blueprint.modelBaseURL,
      }

      if (configMode === 'create') {
        const ensuredToken = await ensureWorkspaceTokenReady(clusterContext)
        const modelAPIKey = ensuredToken.key

        const response = await createAgent(buildCreatePayload(nextBlueprint, modelAPIKey), clusterContext)
        const createdAgentName = response?.agent?.agentName || nextBlueprint.appName
        const createdAliasName = response?.agent?.aliasName || nextBlueprint.aliasName
        setMessage(`已创建 ${getAgentLabel(createdAliasName, createdAgentName)}`)
      } else {
        if (!editingItem) {
          throw new Error('未找到要更新的 Agent')
        }

        const response = await updateAgent(editingItem.name, buildUpdatePayload(nextBlueprint), clusterContext)
        const updatedAgentName = response?.agent?.agentName || editingItem.name
        const updatedAliasName = response?.agent?.aliasName || nextBlueprint.aliasName
        setMessage(`已更新 ${getAgentLabel(updatedAliasName, updatedAgentName)}`)
      }

      closeConfigModal()
      await loadAll()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }, [
    blueprint,
    buildCreatePayload,
    buildUpdatePayload,
    closeConfigModal,
    clusterContext,
    configMode,
    editingItem,
    getAgentLabel,
    loadAll,
    ensureWorkspaceTokenReady,
    workspaceAIProxyModelBaseURL,
  ])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || !clusterContext) return

    setDeleting(true)

    try {
      await deleteAgent(deleteTarget.name, clusterContext)
      setDeleteTarget(null)
      setMessage(`已删除 ${getAgentLabel(deleteTarget.aliasName, deleteTarget.name)}`)
      await loadAll()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }, [clusterContext, deleteTarget, getAgentLabel, loadAll])

  const handleToggleState = useCallback(
    async (item: AgentListItem) => {
      if (!clusterContext) {
        setMessage('缺少集群上下文，无法切换运行状态。')
        return
      }

      try {
        if (item.status === 'running') {
          await pauseAgent(item.name, clusterContext)
          setMessage(`已暂停 ${getAgentLabel(item.aliasName, item.name)}`)
        } else if (item.status === 'stopped') {
          await runAgent(item.name, clusterContext)
          setMessage(`已启动 ${getAgentLabel(item.aliasName, item.name)}`)
        } else {
          return
        }

        await loadAll()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '切换运行状态失败')
      }
    },
    [clusterContext, getAgentLabel, loadAll],
  )

  const handleCopy = useCallback(async (value: string, key: string) => {
    if (!value) return

    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(''), 2000)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '复制失败')
    }
  }, [])

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <AgentHubHeader
        keyword={keyword}
        onCreate={openCreateFlow}
        onKeywordChange={setKeyword}
        operator={clusterInfo?.operator || 'Sealos'}
      />

      <main className="mx-auto max-w-[1240px] px-6 py-8">
        <AgentHubOverview message={message} />

        {loading ? (
          <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500 shadow-sm">
            正在加载 Agent 实例...
          </div>
        ) : (
          <AgentInstancesTable
            copiedValue={copiedKey}
            items={filteredItems}
            onChat={openChat}
            onCopy={handleCopy}
            onCreate={openCreateFlow}
            onDelete={setDeleteTarget}
            onEdit={openEditFlow}
            onTerminal={openTerminal}
            onToggleState={handleToggleState}
          />
        )}
      </main>

      <AgentTemplatePickerModal
        onClose={() => setShowTemplatePicker(false)}
        onContinue={proceedCreateFlow}
        onSelect={setSelectedTemplateId}
        open={showTemplatePicker}
        selectedTemplateId={selectedTemplateId}
      />

      <AgentConfigModal
        blueprint={blueprint}
        mode={configMode}
        onChange={handleBlueprintChange}
        onClose={closeConfigModal}
        onSelectPreset={handleSelectPreset}
        onSubmit={handleSubmit}
        open={showConfigModal}
        submitting={submitting}
        templateId={selectedTemplateId}
        workspaceModelBaseURL={workspaceAIProxyModelBaseURL}
        workspaceModelKey={workspaceAIProxyToken?.key || ''}
        workspaceModelKeyReady={Boolean(workspaceAIProxyToken?.key)}
      />

      <DeleteAgentModal
        item={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        open={Boolean(deleteTarget)}
        submitting={deleting}
      />

      <AgentChatModal
        onClose={closeChat}
        onDraftChange={setChatDraft}
        onSend={sendChatMessage}
        open={Boolean(chatSession)}
        session={chatSession}
      />

      <AgentTerminalModal
        containerRef={terminalContainerRef}
        onClose={closeTerminal}
        open={Boolean(terminalSession)}
        session={terminalSession}
      />
    </div>
  )
}
