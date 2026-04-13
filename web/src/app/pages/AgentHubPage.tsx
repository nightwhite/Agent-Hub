import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  buildChatApiCandidates,
  buildPodExecWsCandidates,
  createClusterContext,
  createResource,
  deleteResource,
  findExecPodForApp,
  getClusterInfo,
  getCreateBlueprint,
  getPreferredAuthToken,
  listResources,
  updateResource,
} from '../../api'
import { CHAT_TRANSPORT, createOpenAIChatConnection } from '../../chat'
import {
  AGENT_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  EMPTY_BLUEPRINT,
  RESOURCE_PRESETS,
  applyTemplateToBlueprint,
  resolveResourcePreset,
} from '../../domains/agents/templates'
import {
  createBlueprintFromResourceGroup,
  ensureDns1035Name,
  findResourceGroup,
  mapResourcesToAgentListItems,
  splitArgsText,
} from '../../domains/agents/mappers'
import type {
  AgentBlueprint,
  AgentListItem,
  AgentTemplateId,
  ChatMessage,
  ChatSessionState,
  ClusterContext,
  ClusterInfo,
  ResourceCollection,
  ResourceItem,
  TerminalSessionState,
} from '../../domains/agents/types'
import { AgentConfigModal } from '../../components/business/agents/AgentConfigModal'
import { DeleteAgentModal } from '../../components/business/agents/DeleteAgentModal'
import { AgentInstancesTable } from '../../components/business/agents/AgentInstancesTable'
import { AgentTemplatePickerModal } from '../../components/business/agents/AgentTemplatePickerModal'
import { AgentChatModal } from '../../components/business/chat/AgentChatModal'
import { AgentTerminalModal } from '../../components/business/terminal/AgentTerminalModal'
import { Button } from '../../components/ui/Button'
import { SearchField } from '../../components/ui/SearchField'
import { getSealosHostConfig, getSealosLanguage, getSealosQuota, getSealosSession } from '../../sealosSdk'

const sharedAnnotations = {
  'kubernetes.io/ingress.class': 'nginx',
  'nginx.ingress.kubernetes.io/proxy-body-size': '32m',
  'nginx.ingress.kubernetes.io/ssl-redirect': 'false',
  'nginx.ingress.kubernetes.io/backend-protocol': 'HTTP',
  'nginx.ingress.kubernetes.io/client-body-buffer-size': '64k',
  'nginx.ingress.kubernetes.io/proxy-buffer-size': '64k',
  'nginx.ingress.kubernetes.io/proxy-send-timeout': '300',
  'nginx.ingress.kubernetes.io/proxy-read-timeout': '300',
  'nginx.ingress.kubernetes.io/server-snippet':
    'client_header_buffer_size 64k;\nlarge_client_header_buffers 4 128k;',
}

const createChatSession = (resource: AgentListItem): ChatSessionState => ({
  resource,
  draft: '',
  status: 'idle',
  transport: CHAT_TRANSPORT.sse,
  error: '',
  triedApiUrls: [],
  messages: [],
})

const createTerminalSession = (resource: AgentListItem): TerminalSessionState => ({
  resource,
  status: 'initializing',
  error: '',
  podName: '',
  containerName: '',
  namespace: '',
  wsUrl: '',
})

type CreateBlueprintSeedLike = {
  appName: string
  namespace: string
  apiKey: string
  domainPrefix: string
  fullDomain: string
  state: string
  runtimeClassName: string
  storageLimit: string
  serviceType: 'ClusterIP'
  protocol: 'TCP'
  user: string
  workingDir: string
  args: string[]
}

type ChatConnectionEvent = {
  type: string
  transport: string
  payload?: any
  error?: Error
}

const buildAgentLabels = (user: string, clusterContext: ClusterContext | null) => ({
  'agent.sealos.io/name': clusterContext?.agentLabel || user,
})

const buildResourcePayloads = (source: AgentBlueprint, clusterContext: ClusterContext | null) => {
  const args = splitArgsText(source.argsText)
  const agentLabels = buildAgentLabels(source.user, clusterContext)
  const ingressName = `network-${source.domainPrefix}`
  const appSelector = {
    app: source.appName,
    ...agentLabels,
  }

  const devbox = {
    name: source.appName,
    owner: source.user,
    image: source.image,
    replicas: Number(source.port),
    status: source.state,
    desc: `DevBox / ${source.namespace}`,
    yaml: {
      apiVersion: 'devbox.sealos.io/v1alpha2',
      kind: 'Devbox',
      metadata: {
        name: source.appName,
        namespace: source.namespace,
        labels: appSelector,
      },
      spec: {
        image: source.image,
        state: source.state,
        runtimeClassName: source.runtimeClassName,
        storageLimit: source.storageLimit,
        network: {
          type: 'SSHGate',
          extraPorts: [{ containerPort: Number(source.port) }],
        },
        resource: {
          cpu: source.cpu,
          memory: source.memory,
        },
        config: {
          labels: appSelector,
          user: source.user,
          workingDir: source.workingDir,
          appPorts: [
            {
              name: source.appName,
              port: Number(source.port),
              protocol: source.protocol,
              targetPort: Number(source.port),
            },
          ],
          env: [
            { name: 'API_SERVER_KEY', value: source.apiKey },
            { name: 'API_SERVER_ENABLED', value: 'true' },
            { name: 'API_SERVER_HOST', value: '0.0.0.0' },
            { name: 'API_SERVER_PORT', value: String(source.port) },
          ],
          args,
        },
      },
    },
  }

  const service = {
    name: source.appName,
    owner: source.user,
    image: source.serviceType,
    replicas: Number(source.port),
    status: 'Healthy',
    desc: `Service / ${source.namespace}`,
    yaml: {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: source.appName,
        namespace: source.namespace,
        labels: appSelector,
      },
      spec: {
        type: source.serviceType,
        selector: appSelector,
        ports: [
          {
            name: 'api',
            port: Number(source.port),
            targetPort: Number(source.port),
            protocol: source.protocol,
          },
        ],
      },
    },
  }

  const ingress = {
    name: ingressName,
    owner: source.user,
    image: source.fullDomain,
    replicas: Number(source.port),
    status: 'Active',
    desc: `Ingress / ${source.namespace}`,
    yaml: {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: ingressName,
        namespace: source.namespace,
        labels: {
          ...appSelector,
          'cloud.sealos.io/app-deploy-manager': source.appName,
          'cloud.sealos.io/app-deploy-manager-domain': source.domainPrefix,
        },
        annotations: sharedAnnotations,
      },
      spec: {
        rules: [
          {
            host: source.fullDomain,
            http: {
              paths: [
                {
                  pathType: 'Prefix',
                  path: '/',
                  backend: {
                    service: {
                      name: source.appName,
                      port: {
                        number: Number(source.port),
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
        tls: [
          {
            hosts: [source.fullDomain],
            secretName: 'wildcard-cert',
          },
        ],
      },
    },
  }

  return { devbox, service, ingress }
}

export function AgentHubPage() {
  const [resources, setResources] = useState<ResourceCollection>({ devbox: [], service: [], ingress: [] })
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null)
  const [clusterContext, setClusterContext] = useState<ClusterContext | null>(null)
  const [hostConfig, setHostConfig] = useState<Record<string, unknown> | null>(null)
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
  const [chatSession, setChatSession] = useState<ChatSessionState | null>(null)
  const [terminalSession, setTerminalSession] = useState<TerminalSessionState | null>(null)

  const chatConnectionRef = useRef<ReturnType<typeof createOpenAIChatConnection> | null>(null)
  const terminalContainerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<any>(null)
  const terminalFitAddonRef = useRef<any>(null)
  const terminalSocketRef = useRef<WebSocket | null>(null)
  const terminalDataDisposableRef = useRef<any>(null)

  const items = useMemo(() => mapResourcesToAgentListItems(resources, clusterInfo), [resources, clusterInfo])

  const filteredItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return items

    return items.filter((item) =>
      [item.name, item.labelId, item.template.name, item.apiUrl, item.owner].join(' ').toLowerCase().includes(normalized),
    )
  }, [items, keyword])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const session = await getSealosSession().catch(() => null)
      await getSealosLanguage().catch(() => null)
      await getSealosQuota().catch(() => null)
      const nextHostConfig = await getSealosHostConfig().catch(() => null)
      setHostConfig(nextHostConfig)

      const nextClusterContext = createClusterContext(session)
      setClusterContext(nextClusterContext)

      if (session?.kubeconfig) {
        sessionStorage.setItem('hermes-kubeconfig', session.kubeconfig)
      }
      const rawRegionDomain =
        session?.subscription?.RegionDomain || nextHostConfig?.cloud?.domain || nextHostConfig?.domain || ''
      const regionDomain = String(rawRegionDomain || '').trim().replace(/\.sealos\.io$/i, '.sealos.app')
      if (regionDomain) {
        sessionStorage.setItem('hermes-region-domain', regionDomain)
      }

      const [nextClusterInfo, devbox, service, ingress] = await Promise.all([
        getClusterInfo(nextClusterContext),
        listResources('devbox', nextClusterContext),
        listResources('service', nextClusterContext),
        listResources('ingress', nextClusterContext),
      ])

      setClusterInfo(nextClusterInfo)
      setResources({ devbox, service, ingress })
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const openCreateFlow = () => {
    setConfigMode('create')
    setEditingItem(null)
    setSelectedTemplateId(DEFAULT_TEMPLATE_ID)
    setBlueprint({ ...EMPTY_BLUEPRINT })
    setShowTemplatePicker(true)
  }

  const closeConfigModal = () => {
    setShowConfigModal(false)
    setEditingItem(null)
    setConfigMode('create')
    setBlueprint({ ...EMPTY_BLUEPRINT })
    setSelectedTemplateId(DEFAULT_TEMPLATE_ID)
  }

  const loadBlueprint = useCallback(async () => {
    if (!clusterContext) {
      throw new Error('缺少集群上下文')
    }

    const seed = getCreateBlueprint(clusterContext, hostConfig, resources.ingress) as CreateBlueprintSeedLike
    const safeAppName = ensureDns1035Name(
      seed.appName,
      selectedTemplateId === 'openclaw' ? 'openclaw' : 'agent',
    )

    setBlueprint(
      applyTemplateToBlueprint(
        {
          appName: safeAppName,
          namespace: seed.namespace,
          apiKey: seed.apiKey,
          domainPrefix: seed.domainPrefix,
          fullDomain: seed.fullDomain,
          state: seed.state === 'Paused' ? 'Paused' : 'Running',
          runtimeClassName: seed.runtimeClassName,
          storageLimit: seed.storageLimit,
          serviceType: seed.serviceType,
          protocol: seed.protocol,
          user: clusterContext.operator || seed.user,
          workingDir: seed.workingDir,
          args: seed.args,
        },
        selectedTemplateId,
      ),
    )
  }, [clusterContext, hostConfig, resources.ingress, selectedTemplateId])

  const proceedCreateFlow = async () => {
    try {
      await loadBlueprint()
      setShowTemplatePicker(false)
      setShowConfigModal(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载创建模板失败')
    }
  }

  const openEditFlow = (item: AgentListItem) => {
    const resourceGroup = findResourceGroup(resources, item.name)
    setConfigMode('edit')
    setEditingItem(item)
    setSelectedTemplateId(item.templateId)
    setBlueprint(
      createBlueprintFromResourceGroup({
        ...resourceGroup,
        fallbackNamespace: clusterInfo?.namespace,
      }),
    )
    setShowConfigModal(true)
  }

  const handleBlueprintChange = (field: keyof AgentBlueprint, value: string) => {
    setBlueprint((current) => {
      const next = { ...current, [field]: value }
      if (field === 'cpu' || field === 'memory') {
        next.profile = resolveResourcePreset(
          field === 'cpu' ? value : next.cpu,
          field === 'memory' ? value : next.memory,
        )
      }
      return next
    })
  }

  const handleSelectPreset = (presetId: AgentBlueprint['profile']) => {
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
  }

  const handleSubmit = async () => {
    if (!clusterContext) {
      setMessage('缺少集群上下文，无法提交')
      return
    }

    setSubmitting(true)

    try {
      const nextBlueprint =
        configMode === 'create'
          ? {
              ...blueprint,
              appName: ensureDns1035Name(
                blueprint.appName,
                selectedTemplateId === 'openclaw' ? 'openclaw' : 'agent',
              ),
            }
          : blueprint

      const payloads = buildResourcePayloads(nextBlueprint, clusterContext)

      if (configMode === 'create') {
        await Promise.all([
          createResource('devbox', payloads.devbox, clusterContext),
          createResource('service', payloads.service, clusterContext),
          createResource('ingress', payloads.ingress, clusterContext),
        ])
        setMessage(`已创建 ${nextBlueprint.appName}`)
      } else {
        const group = editingItem ? findResourceGroup(resources, editingItem.name) : null
        if (!group?.devbox || !group.service || !group.ingress) {
          throw new Error('未找到完整资源组，无法更新')
        }

        await Promise.all([
          updateResource('devbox', group.devbox.name, payloads.devbox, clusterContext),
          updateResource('service', group.service.name, payloads.service, clusterContext),
          updateResource('ingress', group.ingress.name, payloads.ingress, clusterContext),
        ])
        setMessage(`已更新 ${nextBlueprint.appName}`)
      }

      closeConfigModal()
      await loadAll()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !clusterContext) return

    setDeleting(true)
    try {
      const itemYaml = (deleteTarget.yaml || {}) as {
        metadata?: Record<string, any>
        spec?: Record<string, any>
      }
      const itemLabels = itemYaml.metadata?.labels || {}
      const appLabel =
        itemLabels.app ||
        itemYaml.spec?.selector?.app ||
        itemYaml.spec?.rules?.[0]?.http?.paths?.[0]?.backend?.service?.name ||
        deleteTarget.name
      const agentLabel = itemLabels['agent.sealos.io/name'] || clusterContext.agentLabel || ''

      const sameLabel = (entry: ResourceItem) => {
        const labels = entry?.yaml?.metadata?.labels || {}
        if ((labels?.app || '') !== appLabel) return false
        if (agentLabel && (labels?.['agent.sealos.io/name'] || '') !== agentLabel) return false
        return true
      }

      const targets = [
        ...resources.devbox.filter(sameLabel).map((entry) => ({ type: 'devbox' as const, name: entry.name })),
        ...resources.service.filter(sameLabel).map((entry) => ({ type: 'service' as const, name: entry.name })),
        ...resources.ingress.filter(sameLabel).map((entry) => ({ type: 'ingress' as const, name: entry.name })),
      ].sort((a, b) => ['ingress', 'service', 'devbox'].indexOf(a.type) - ['ingress', 'service', 'devbox'].indexOf(b.type))

      for (const target of targets) {
        await deleteResource(target.type, target.name, clusterContext)
      }

      setDeleteTarget(null)
      setMessage(`已删除 ${deleteTarget.name}`)
      await loadAll()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const handleCopy = async (value: string, key: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(''), 2000)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '复制失败')
    }
  }

  const updateChatSession = (updater: ChatSessionState | ((current: ChatSessionState) => ChatSessionState)) => {
    setChatSession((current) => {
      if (!current) return current
      return typeof updater === 'function' ? updater(current) : updater
    })
  }

  const openChat = (item: AgentListItem) => {
    chatConnectionRef.current?.close()
    chatConnectionRef.current = null

    let host = ''
    if (item.apiUrl) {
      try {
        host = new URL(item.apiUrl).host
      } catch {
        host = ''
      }
    }

    const chatApiCandidates = buildChatApiCandidates(host)
    setChatSession(
      createChatSession({
        ...item,
        apiUrl: chatApiCandidates[0] || item.apiUrl,
        apiKey: item.apiKey,
      }),
    )
  }

  const closeChat = () => {
    chatConnectionRef.current?.close()
    chatConnectionRef.current = null
    setChatSession(null)
  }

  const ensureChatConnection = (resource: AgentListItem) => {
    if (chatConnectionRef.current) {
      return chatConnectionRef.current
    }

    const connection = createOpenAIChatConnection({
      apiUrl: resource.apiUrl,
      apiKey: resource.apiKey,
      preferredTransport: CHAT_TRANSPORT.sse,
      onEvent: (event: ChatConnectionEvent) => {
        if (event.type === 'open') {
          updateChatSession((current) => ({ ...current, status: 'connected', transport: event.transport, error: '' }))
          return
        }

        if (event.type === 'fallback') {
          updateChatSession((current) => ({
            ...current,
            status: 'connecting',
            transport: event.transport,
            error: 'WebSocket 不可用，已自动切换到 SSE。',
          }))
          return
        }

        if (event.type === 'message') {
          const chunk =
            event.payload?.choices?.[0]?.delta?.content ||
            event.payload?.choices?.[0]?.message?.content ||
            event.payload?.content ||
            event.payload?.message ||
            ''

          if (!chunk) return

          updateChatSession((current) => {
            const messages = [...current.messages]
            const lastMessage = messages[messages.length - 1]
            if (lastMessage?.role === 'assistant' && lastMessage.streaming) {
              messages[messages.length - 1] = {
                ...lastMessage,
                content: `${lastMessage.content}${chunk}`,
              }
            } else {
              messages.push({
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: chunk,
                createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                streaming: true,
              })
            }

            return {
              ...current,
              status: 'connected',
              transport: event.transport,
              error: '',
              messages,
            }
          })
          return
        }

        if (event.type === 'done' || event.type === 'close') {
          updateChatSession((current) => ({
            ...current,
            status: 'connected',
            messages: current.messages.map((message) => ({ ...message, streaming: false })),
          }))
          return
        }

        if (event.type === 'error') {
          updateChatSession((current) => ({
            ...current,
            status: 'error',
            error: event.error?.message || '连接失败，请检查 API 地址和 Key。',
          }))
        }
      },
    })

    chatConnectionRef.current = connection
    return connection
  }

  const sendChatMessage = async () => {
    if (!chatSession) return

    const draft = chatSession.draft.trim()
    if (!draft) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: draft,
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    }

    updateChatSession((current) => ({
      ...current,
      status: 'connecting',
      error: '',
      draft: '',
      messages: [...current.messages, userMessage],
    }))

    try {
      const connection = ensureChatConnection(chatSession.resource)
      await connection.send({
        model: AGENT_TEMPLATES[chatSession.resource.templateId].defaultModel,
        messages: [...chatSession.messages, userMessage].map(({ role, content }) => ({ role, content })),
      })
    } catch (error) {
      updateChatSession((current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error.message : '发送失败，请检查 API 地址和 Key。',
      }))
    }
  }

  const closeTerminalSocket = useCallback(() => {
    const socket = terminalSocketRef.current
    terminalSocketRef.current = null
    if (socket && socket.readyState <= WebSocket.OPEN) {
      socket.close(1000, 'manual-close')
    }
  }, [])

  const disconnectTerminal = useCallback(
    (options: { keepSession?: boolean; nextStatus?: TerminalSessionState['status']; nextError?: string } = {}) => {
      const { keepSession = true, nextStatus = 'disconnected', nextError = '' } = options
      closeTerminalSocket()

      if (!keepSession) {
        setTerminalSession(null)
        return
      }

      setTerminalSession((current) =>
        current
          ? {
              ...current,
              status: nextStatus,
              error: nextError,
            }
          : current,
      )
    },
    [closeTerminalSocket],
  )

  const writeTerminalData = useCallback((value: string) => {
    if (terminalRef.current) {
      terminalRef.current.write(value)
    }
  }, [])

  const sendTerminalInput = useCallback((input: string) => {
    const socket = terminalSocketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    const encoder = new TextEncoder()
    const encoded = encoder.encode(input)
    const payload = new Uint8Array(encoded.length + 1)
    payload[0] = 0
    payload.set(encoded, 1)
    socket.send(payload)
  }, [])

  const connectTerminal = useCallback(
    async (resource: AgentListItem) => {
      if (!clusterContext) {
        setTerminalSession((current) =>
          current
            ? {
                ...current,
                status: 'error',
                error: '缺少集群上下文，无法建立终端连接。',
              }
            : current,
        )
        return
      }

      setTerminalSession((current) => (current ? { ...current, status: 'connecting', error: '' } : current))
      closeTerminalSocket()

      try {
        const pod = await findExecPodForApp(resource.name, clusterContext)
        const wsCandidates = buildPodExecWsCandidates({
          namespace: pod.namespace,
          podName: pod.podName,
          containerName: pod.containerName,
          token: getPreferredAuthToken(clusterContext),
          clusterServer: clusterContext.server,
          commands: ['sh', '-lc', 'if command -v hermes >/dev/null 2>&1; then hermes; fi; exec sh'],
        })

        const tryOpenWebSocket = (wsUrl: string, protocols: string[] = ['v4.channel.k8s.io']) =>
          new Promise<WebSocket>((resolve, reject) => {
            let settled = false
            const socket = protocols.length ? new WebSocket(wsUrl, protocols) : new WebSocket(wsUrl)
            const timer = window.setTimeout(() => {
              if (settled) return
              settled = true
              socket.close()
              reject(new Error(`连接超时: ${wsUrl}`))
            }, 6000)

            socket.onopen = () => {
              if (settled) return
              settled = true
              window.clearTimeout(timer)
              resolve(socket)
            }
            socket.onerror = () => undefined
            socket.onclose = (event) => {
              if (settled) return
              settled = true
              window.clearTimeout(timer)
              reject(new Error(`连接关闭（code=${event.code || 0}）: ${wsUrl}`))
            }
          })

        let socket: WebSocket | null = null
        let wsUrl = ''
        for (const candidate of wsCandidates) {
          try {
            socket = await tryOpenWebSocket(candidate, ['v4.channel.k8s.io'])
            wsUrl = candidate
            break
          } catch {
            try {
              socket = await tryOpenWebSocket(candidate, [])
              wsUrl = candidate
              break
            } catch {
              continue
            }
          }
        }

        if (!socket) {
          throw new Error('未建立终端连接，请关闭后重新打开终端。')
        }

        socket.binaryType = 'arraybuffer'
        terminalSocketRef.current = socket
        setTerminalSession((current) =>
          current
            ? {
                ...current,
                status: 'connected',
                error: '',
                podName: pod.podName,
                containerName: pod.containerName,
                namespace: pod.namespace,
                wsUrl,
              }
            : current,
        )

        socket.onmessage = (event) => {
          if (typeof event.data === 'string') {
            const payload = event.data.slice(1)
            writeTerminalData(payload)
            return
          }

          if (event.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(event.data)
            if (!bytes.length) return
            const payload = new TextDecoder().decode(bytes.slice(1))
            writeTerminalData(payload)
          }
        }

        socket.onerror = () => {
          setTerminalSession((current) =>
            current
              ? {
                  ...current,
                  status: 'error',
                  error: '终端连接异常，请关闭后重新打开。',
                }
              : current,
          )
        }

        socket.onclose = (event) => {
          setTerminalSession((current) =>
            current
              ? {
                  ...current,
                  status: current.status === 'error' ? current.status : 'disconnected',
                  error: current.error || (event.code && event.code !== 1000 ? `连接已关闭（code=${event.code}）` : ''),
                }
              : current,
          )
          terminalSocketRef.current = null
        }
      } catch (error) {
        setTerminalSession((current) =>
          current
            ? {
                ...current,
                status: 'error',
                error: error instanceof Error ? error.message : '终端连接失败',
              }
            : current,
        )
      }
    },
    [clusterContext, closeTerminalSocket, writeTerminalData],
  )

  useEffect(() => {
    if (!terminalSession?.resource || !terminalContainerRef.current) return

    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let onWindowResize: (() => void) | null = null

    const initTerminal = async () => {
      try {
        await import('@xterm/xterm/css/xterm.css')
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ])

        if (disposed || !terminalContainerRef.current) return

        const terminal = new Terminal({
          cursorBlink: true,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
          fontSize: 14,
          lineHeight: 1.35,
          convertEol: true,
          scrollback: 4000,
          theme: {
            background: '#05070a',
            foreground: '#f3efe7',
            cursor: '#f6c58f',
            cursorAccent: '#05070a',
            selectionBackground: 'rgba(250, 249, 246, 0.18)',
          },
        })

        const fitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)
        terminal.open(terminalContainerRef.current)
        fitAddon.fit()
        terminal.focus()

        terminalRef.current = terminal
        terminalFitAddonRef.current = fitAddon

        resizeObserver = new ResizeObserver(() => {
          fitAddon.fit()
        })
        resizeObserver.observe(terminalContainerRef.current)
        onWindowResize = () => fitAddon.fit()
        window.addEventListener('resize', onWindowResize)

        terminalDataDisposableRef.current = terminal.onData((input: string) => {
          sendTerminalInput(input)
        })

        connectTerminal(terminalSession.resource)
      } catch (error) {
        setTerminalSession((current) =>
          current
            ? {
                ...current,
                status: 'error',
                error: error instanceof Error ? error.message : '终端初始化失败',
              }
            : current,
        )
      }
    }

    initTerminal()

    return () => {
      disposed = true
      terminalDataDisposableRef.current?.dispose?.()
      terminalDataDisposableRef.current = null
      if (onWindowResize) {
        window.removeEventListener('resize', onWindowResize)
      }
      resizeObserver?.disconnect()
      terminalRef.current?.dispose?.()
      terminalRef.current = null
      terminalFitAddonRef.current = null
      disconnectTerminal({ keepSession: true, nextStatus: 'disconnected' })
    }
  }, [connectTerminal, disconnectTerminal, sendTerminalInput, terminalSession?.resource])

  useEffect(
    () => () => {
      chatConnectionRef.current?.close()
      chatConnectionRef.current = null
      terminalDataDisposableRef.current?.dispose?.()
      terminalDataDisposableRef.current = null
      const socket = terminalSocketRef.current
      terminalSocketRef.current = null
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close(1000, 'unmount')
      }
      terminalRef.current?.dispose?.()
      terminalRef.current = null
      terminalFitAddonRef.current = null
    },
    [],
  )

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-brand)] text-lg font-bold text-white">
              A
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-950">AgentHub</div>
              <div className="mt-1 text-sm text-slate-500">
                Workspace: {clusterInfo?.operator || 'Sealos'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <SearchField
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索实例名称、模板或 labels id..."
              value={keyword}
            />
            <Button leading={<Plus size={18} />} onClick={openCreateFlow}>
              创建 Agent
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-6 py-8">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
            <div className="pointer-events-none absolute right-[-84px] top-[-64px] h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.18),rgba(37,99,235,0))]" />
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand)]">
                Sealos Launchpad
              </div>
              <h1 className="mt-3 text-[28px] font-semibold leading-tight text-slate-950">
                一键创建热门 Agent，部署完成后直接对话或进终端。
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">
                首页仍然是 Agent 列表，右上角创建。普通用户只需要理解一个实例，不需要理解底层 DevBox、Service 和 Ingress。
              </p>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">当前能力</div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <div>Hermes Agent: 对话 + 终端</div>
              <div>OpenClaw: Beta 创建入口 + 终端能力</div>
              <div>资源配置: CPU、内存、存储</div>
            </div>
            {message ? (
              <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                {message}
              </div>
            ) : null}
          </div>
        </div>

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
            onTerminal={(item) => setTerminalSession(createTerminalSession(item))}
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
        onDraftChange={(value) =>
          updateChatSession((current) => ({
            ...current,
            draft: value,
          }))
        }
        onSend={sendChatMessage}
        open={Boolean(chatSession)}
        session={chatSession}
      />

      <AgentTerminalModal
        containerRef={terminalContainerRef}
        onClose={() => disconnectTerminal({ keepSession: false })}
        open={Boolean(terminalSession)}
        session={terminalSession}
      />
    </div>
  )
}
