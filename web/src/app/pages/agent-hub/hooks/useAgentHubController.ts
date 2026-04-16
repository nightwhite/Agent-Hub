import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createAgent,
  createClusterContext,
  deleteAgent,
  deriveAIProxyModelBaseURL,
  ensureAIProxyToken,
  getClusterInfo,
  getCreateBlueprint,
  listAgents,
  pauseAgent,
  runAgent,
  updateAgent,
} from '../../../../api'
import {
  applyTemplateToBlueprint,
  resolveTemplateById,
} from '../../../../domains/agents/templates'
import {
  ensureDns1035Name,
  mapBackendAgentsToListItems,
} from '../../../../domains/agents/mappers'
import type {
  AgentBlueprint,
  AgentListItem,
  AgentTemplateId,
  ClusterContext,
  ClusterInfo,
  WorkspaceAIProxyToken,
} from '../../../../domains/agents/types'
import { getSealosSession } from '../../../../sealosSdk'

const WORKSPACE_AIPROXY_TOKEN_NAME = 'Agent-Hub'
const INITIAL_LOAD_CACHE_TTL_MS = 2000
const WORKSPACE_TOKEN_RETRY_COOLDOWN_MS = 30_000

type InitialLoadSnapshot = {
  clusterContext: ClusterContext
  clusterInfo: ClusterInfo
  items: AgentListItem[]
}

let initialLoadPromise: Promise<InitialLoadSnapshot> | null = null
let initialLoadCache: InitialLoadSnapshot | null = null
let initialLoadCacheAt = 0
let clusterContextCache: ClusterContext | null = null
let clusterContextPromise: Promise<ClusterContext> | null = null
let workspaceTokenCache: WorkspaceAIProxyToken | null = null
let workspaceTokenPromise: Promise<WorkspaceAIProxyToken | null> | null = null
let workspaceTokenFailureAt = 0

const toWorkspaceAIProxyToken = (payload: any): WorkspaceAIProxyToken | null => {
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
}

const applyInitialLoadCache = (snapshot: InitialLoadSnapshot) => {
  initialLoadCache = snapshot
  initialLoadCacheAt = Date.now()
  return snapshot
}

const readInitialLoadCache = () => {
  if (!initialLoadCache) {
    return null
  }
  if (Date.now() - initialLoadCacheAt > INITIAL_LOAD_CACHE_TTL_MS) {
    initialLoadCache = null
    return null
  }
  return initialLoadCache
}

const readStoredClusterContext = () => {
  try {
    const context = createClusterContext(null)
    clusterContextCache = context
    return context
  } catch {
    return null
  }
}

const resolveCachedClusterContext = async () => {
  if (clusterContextCache?.kubeconfig && clusterContextCache.namespace && clusterContextCache.server) {
    return clusterContextCache
  }

  const storedContext = readStoredClusterContext()
  if (storedContext) {
    return storedContext
  }

  if (clusterContextPromise) {
    return clusterContextPromise
  }

  clusterContextPromise = getSealosSession()
    .catch(() => null)
    .then((session) => {
      const context = createClusterContext(session)
      clusterContextCache = context
      return context
    })
    .finally(() => {
      clusterContextPromise = null
    })

  return clusterContextPromise
}

const fetchInitialLoadSnapshot = async (): Promise<InitialLoadSnapshot> => {
  const cached = readInitialLoadCache()
  if (cached) {
    return cached
  }

  if (initialLoadPromise) {
    return initialLoadPromise
  }

  initialLoadPromise = (async () => {
    const nextClusterContext = await resolveCachedClusterContext()
    const [nextClusterInfo, response] = await Promise.all([
      getClusterInfo(nextClusterContext),
      listAgents(nextClusterContext),
    ])
    const mappedItems = mapBackendAgentsToListItems(response?.items || [], nextClusterInfo)

    return applyInitialLoadCache({
      clusterContext: nextClusterContext,
      clusterInfo: nextClusterInfo,
      items: mappedItems,
    })
  })().finally(() => {
    initialLoadPromise = null
  })

  return initialLoadPromise
}

export function useAgentHubController() {
  const [items, setItems] = useState<AgentListItem[]>([])
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null)
  const [clusterContext, setClusterContext] = useState<ClusterContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [workspaceAIProxyToken, setWorkspaceAIProxyToken] = useState<WorkspaceAIProxyToken | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const initialLoadRef = useRef(false)

  const resolveClusterContext = useCallback(async () => {
    if (clusterContext?.kubeconfig && clusterContext.namespace && clusterContext.server) {
      clusterContextCache = clusterContext
      return clusterContext
    }

    return resolveCachedClusterContext()
  }, [clusterContext])

  const hydrateWorkspaceToken = useCallback(
    async (context: ClusterContext) => {
      if (workspaceAIProxyToken?.key) return workspaceAIProxyToken
      if (workspaceTokenCache?.key) {
        setWorkspaceAIProxyToken(workspaceTokenCache)
        return workspaceTokenCache
      }

      if (workspaceTokenPromise) {
        const token = await workspaceTokenPromise
        if (token?.key) {
          setWorkspaceAIProxyToken(token)
        }
        return token
      }

      if (workspaceTokenFailureAt && Date.now() - workspaceTokenFailureAt < WORKSPACE_TOKEN_RETRY_COOLDOWN_MS) {
        return null
      }

      try {
        workspaceTokenPromise = ensureAIProxyToken(context, { name: WORKSPACE_AIPROXY_TOKEN_NAME })
          .then((payload) => toWorkspaceAIProxyToken(payload))
          .then((ensuredToken) => {
            if (ensuredToken?.key) {
              workspaceTokenCache = ensuredToken
            }
            return ensuredToken
          })
          .catch((error) => {
            workspaceTokenFailureAt = Date.now()
            console.warn('[aiproxy] ensure workspace token failed', {
              message: error instanceof Error ? error.message : String(error || ''),
            })
            return null
          })
          .finally(() => {
            workspaceTokenPromise = null
          })

        const ensuredToken = await workspaceTokenPromise
        if (ensuredToken?.key) {
          setWorkspaceAIProxyToken(ensuredToken)
        }
        return ensuredToken
      } catch (error) {
        return null
      }
    },
    [workspaceAIProxyToken],
  )

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
    [workspaceAIProxyToken],
  )

  const loadAll = useCallback(
    async ({ ensureWorkspaceToken = false }: { ensureWorkspaceToken?: boolean } = {}) => {
      setLoading(true)

      try {
        const nextClusterContext = await resolveClusterContext()
        const [nextClusterInfo, response] = await Promise.all([
          getClusterInfo(nextClusterContext),
          listAgents(nextClusterContext),
        ])
        const mappedItems = mapBackendAgentsToListItems(response?.items || [], nextClusterInfo)

        setClusterContext(nextClusterContext)
        setClusterInfo(nextClusterInfo)
        setItems(mappedItems)
        applyInitialLoadCache({
          clusterContext: nextClusterContext,
          clusterInfo: nextClusterInfo,
          items: mappedItems,
        })

        setMessage('')

        if (ensureWorkspaceToken) {
          void hydrateWorkspaceToken(nextClusterContext)
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '加载失败')
      } finally {
        setLoading(false)
      }
    },
    [hydrateWorkspaceToken, resolveClusterContext],
  )

  const loadItemsSilently = useCallback(
    async ({ ensureWorkspaceToken = false }: { ensureWorkspaceToken?: boolean } = {}) => {
      try {
        const nextClusterContext = await resolveClusterContext()
        const nextClusterInfo = clusterInfo || (await getClusterInfo(nextClusterContext))
        const response = await listAgents(nextClusterContext)
        const mappedItems = mapBackendAgentsToListItems(response?.items || [], nextClusterInfo)

        setClusterContext(nextClusterContext)
        setClusterInfo(nextClusterInfo)
        setItems((prev) => {
          if (prev.length === mappedItems.length) {
            const prevSig = prev.map((it) => `${it.id}:${it.status}:${it.ready}:${it.updatedAt}:${it.bootstrapPhase}:${it.bootstrapMessage}`).join('|')
            const nextSig = mappedItems.map((it) => `${it.id}:${it.status}:${it.ready}:${it.updatedAt}:${it.bootstrapPhase}:${it.bootstrapMessage}`).join('|')
            if (prevSig === nextSig) {
              return prev
            }
          }
          return mappedItems
        })
        applyInitialLoadCache({
          clusterContext: nextClusterContext,
          clusterInfo: nextClusterInfo,
          items: mappedItems,
        })

        if (ensureWorkspaceToken) {
          void hydrateWorkspaceToken(nextClusterContext)
        }
      } catch (error) {
        console.warn('[agent-hub] silent refresh failed', error)
      }
    },
    [clusterInfo, hydrateWorkspaceToken, resolveClusterContext],
  )

  useEffect(() => {
    if (initialLoadRef.current) return
    initialLoadRef.current = true

    let disposed = false
    setLoading(true)

    void fetchInitialLoadSnapshot()
      .then((snapshot) => {
        if (disposed) return
        setClusterContext(snapshot.clusterContext)
        setClusterInfo(snapshot.clusterInfo)
        setItems(snapshot.items)
        setMessage('')
        void hydrateWorkspaceToken(snapshot.clusterContext)
      })
      .catch((error) => {
        if (disposed) return
        setMessage(error instanceof Error ? error.message : '加载失败')
      })
      .finally(() => {
        if (disposed) return
        setLoading(false)
      })

    return () => {
      disposed = true
    }
  }, [hydrateWorkspaceToken])

  useEffect(() => {
    const hasPendingItems = items.some((item) => item.status === 'creating' || (item.status === 'running' && !item.ready))

    if (!hasPendingItems) {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      return
    }

    if (!refreshTimerRef.current) {
      refreshTimerRef.current = window.setInterval(() => {
        void loadItemsSilently()
      }, 3000)
    }

    return () => {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [items, loadItemsSilently])

  const prepareCreateBlueprint = useCallback(
    async (templateId: AgentTemplateId): Promise<AgentBlueprint> => {
      if (!clusterContext) {
        throw new Error('缺少集群上下文，无法创建 Agent。')
      }

      const template = resolveTemplateById(templateId)
      if (!template.backendSupported) {
        throw new Error(template.createDisabledReason || '当前模板暂未接入后端管理 API。')
      }

      const seed = getCreateBlueprint(clusterContext, undefined, [])
      const safeAppName = ensureDns1035Name(seed.appName, 'agent')
      const ensuredWorkspaceToken = await ensureWorkspaceTokenReady(clusterContext).catch(() => null)

      return {
        ...applyTemplateToBlueprint(
          {
            ...seed,
            appName: safeAppName,
            aliasName: '',
            state: seed.state === 'Paused' ? 'Paused' : 'Running',
            serviceType: 'ClusterIP',
            protocol: 'TCP',
          },
          templateId,
        ),
        modelProvider: 'custom',
        modelBaseURL: workspaceAIProxyModelBaseURL,
        hasModelAPIKey: Boolean(ensuredWorkspaceToken?.key),
      }
    },
    [clusterContext, ensureWorkspaceTokenReady, workspaceAIProxyModelBaseURL],
  )

  const buildCreatePayload = useCallback(
    (source: AgentBlueprint) => ({
      'template-id': source.productType,
      'agent-name': ensureDns1035Name(source.appName, 'agent'),
      'agent-cpu': source.cpu,
      'agent-memory': source.memory,
      'agent-storage': source.storageLimit,
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

  const createAgentFromBlueprint = useCallback(
    async (blueprint: AgentBlueprint) => {
      if (!clusterContext) {
        throw new Error('缺少集群上下文，无法提交')
      }

      const aliasName = blueprint.aliasName.trim()
      if (!aliasName) {
        throw new Error('请填写 Agent 别名')
      }

      const model = blueprint.model.trim()
      if (!model) {
        throw new Error('请选择模型')
      }

      setSubmitting(true)

      try {
        const nextBlueprint = {
          ...blueprint,
          appName: ensureDns1035Name(blueprint.appName, 'agent'),
          aliasName,
          model,
          modelProvider: 'custom',
          modelBaseURL: workspaceAIProxyModelBaseURL || blueprint.modelBaseURL,
        }

        const response = await createAgent(buildCreatePayload(nextBlueprint), clusterContext)
        const createdAgentName = response?.agent?.agentName || nextBlueprint.appName
        const createdAliasName = response?.agent?.aliasName || nextBlueprint.aliasName

        setMessage(`已创建 ${getAgentLabel(createdAliasName, createdAgentName)}`)
        await loadAll()

        return {
          agentName: createdAgentName,
          aliasName: createdAliasName,
          response,
        }
      } finally {
        setSubmitting(false)
      }
    },
    [
      buildCreatePayload,
      clusterContext,
      getAgentLabel,
      loadAll,
      workspaceAIProxyModelBaseURL,
    ],
  )

  const updateAgentFromBlueprint = useCallback(
    async (item: AgentListItem, blueprint: AgentBlueprint) => {
      if (!clusterContext) {
        throw new Error('缺少集群上下文，无法提交')
      }

      const aliasName = blueprint.aliasName.trim()
      if (!aliasName) {
        throw new Error('请填写 Agent 别名')
      }

      const model = blueprint.model.trim()
      if (!model) {
        throw new Error('请选择模型')
      }

      const modelProvider = blueprint.modelProvider.trim()
      const modelBaseURL = blueprint.modelBaseURL.trim()

      if (!modelProvider) {
        throw new Error('请填写 Hermes Provider')
      }

      if (!modelBaseURL) {
        throw new Error('请填写模型 Base URL')
      }

      setSubmitting(true)

      try {
        const nextBlueprint = {
          ...blueprint,
          appName: ensureDns1035Name(blueprint.appName, 'agent'),
          aliasName,
          model,
          modelProvider,
          modelBaseURL,
        }

        const response = await updateAgent(item.name, buildUpdatePayload(nextBlueprint), clusterContext)
        const updatedAgentName = response?.agent?.agentName || item.name
        const updatedAliasName = response?.agent?.aliasName || nextBlueprint.aliasName

        setMessage(`已更新 ${getAgentLabel(updatedAliasName, updatedAgentName)}`)
        await loadAll()

        return {
          agentName: updatedAgentName,
          aliasName: updatedAliasName,
          response,
        }
      } finally {
        setSubmitting(false)
      }
    },
    [buildUpdatePayload, clusterContext, getAgentLabel, loadAll],
  )

  const deleteAgentItem = useCallback(
    async (item: AgentListItem) => {
      if (!clusterContext) {
        throw new Error('缺少集群上下文，无法删除')
      }

      setDeleting(true)

      try {
        await deleteAgent(item.name, clusterContext)
        setMessage(`已删除 ${getAgentLabel(item.aliasName, item.name)}`)
        await loadAll()
      } finally {
        setDeleting(false)
      }
    },
    [clusterContext, getAgentLabel, loadAll],
  )

  const toggleItemState = useCallback(
    async (item: AgentListItem) => {
      if (!clusterContext) {
        throw new Error('缺少集群上下文，无法切换运行状态。')
      }

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
    },
    [clusterContext, getAgentLabel, loadAll],
  )

  const findItemByName = useCallback(
    (agentName: string) => items.find((item) => item.name === agentName) || null,
    [items],
  )

  return {
    items,
    clusterInfo,
    clusterContext,
    loading,
    submitting,
    deleting,
    message,
    setMessage,
    workspaceAIProxyToken,
    workspaceAIProxyModelBaseURL,
    loadAll,
    loadItemsSilently,
    prepareCreateBlueprint,
    createAgentFromBlueprint,
    updateAgentFromBlueprint,
    deleteAgentItem,
    toggleItemState,
    ensureWorkspaceTokenReady,
    findItemByName,
  }
}
