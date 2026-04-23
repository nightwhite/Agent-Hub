import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  Home,
  LoaderCircle,
  Plus,
  Search,
  Terminal,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createClusterContext,
  getAgentConsole,
  getClusterInfo,
  listAgentTemplates,
} from '../../../api'
import { APP_NAME } from '../../../branding'
import { AgentMarkdownPreview } from '../../../components/business/files/AgentMarkdownPreview'
import {
  isMarkdownLikeFile,
  isTextPreviewableFile,
} from '../../../components/business/files/fileHelpers'
import { AgentTerminalWorkspace } from '../../../components/business/terminal/AgentTerminalWorkspace'
import { mapBackendAgentsToListItems } from '../../../domains/agents/mappers'
import { hydrateTemplateCatalog } from '../../../domains/agents/templates'
import type {
  AgentAccessItem,
  AgentConsoleServiceItem,
  AgentFileItem,
  AgentListItem,
  ClusterContext,
  FilesSessionState,
  TerminalSessionState,
} from '../../../domains/agents/types'
import { addSealosAppEventListener, getSealosSession } from '../../../sealosSdk'
import { useAgentFiles } from './hooks/useAgentFiles'
import { useAgentTerminal } from './hooks/useAgentTerminal'
import { parseAgentTerminalDesktopMessage } from './lib/desktopMessages'

const defaultConsoleTitle = 'Agent 控制台'

type HomeTab = {
  id: string
  type: 'home'
  title: string
}

type TerminalTab = {
  id: string
  type: 'terminal'
  title: string
}

type WebTab = {
  id: string
  type: 'web'
  title: string
  url: string
  serviceKey: string
  refreshKey: number
}

type FileTab = {
  id: string
  type: 'file'
  title: string
  path: string
  entry: AgentFileItem
  loading: boolean
  loaded: boolean
  error: string
  content: string
  fromCache: boolean
  stale: boolean
}

type ConsoleTab = HomeTab | TerminalTab | WebTab | FileTab

type TerminalTabStateMap = Record<string, TerminalSessionState['status']>
type ExplorerChildrenMap = Record<string, AgentFileItem[]>
type ExplorerFlagMap = Record<string, boolean>
type ExplorerErrorMap = Record<string, string>

const initialTabs: ConsoleTab[] = [{ id: 'home', type: 'home', title: '控制台首页' }]
const fileSystemRootPath = '/'

const normalizeExplorerPath = (value: string) => {
  const raw = String(value || '').trim()
  if (!raw) return fileSystemRootPath

  const normalized = raw.replace(/\/+/g, '/').replace(/\/+$/, '')
  if (!normalized) return fileSystemRootPath

  if (normalized.startsWith('/')) {
    return normalized
  }

  return `/${normalized}`
}

const buildExplorerPathChain = (value: string) => {
  const normalized = normalizeExplorerPath(value)
  if (normalized === fileSystemRootPath) {
    return [fileSystemRootPath]
  }

  const segments = normalized.split('/').filter(Boolean)
  const chain: string[] = [fileSystemRootPath]
  let current = ''
  for (const segment of segments) {
    current += `/${segment}`
    chain.push(current)
  }
  return chain
}

const iconForTab = (tab: ConsoleTab) => {
  switch (tab.type) {
    case 'home':
      return Home
    case 'terminal':
      return Terminal
    case 'web':
      return Globe
    case 'file':
      return FileText
  }
}

const readServiceList = (
  fromConsole: AgentConsoleServiceItem[],
  fromAccess: AgentAccessItem[],
): AgentConsoleServiceItem[] => {
  if (fromConsole.length > 0) {
    return fromConsole.filter((service) => String(service.url || '').trim())
  }

  return fromAccess
    .filter((entry) => String(entry.url || '').trim())
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      url: String(entry.url || '').trim(),
      enabled: Boolean(entry.enabled),
      status: entry.status,
      reason: entry.reason,
    }))
}

function terminalStatusLabel(status?: TerminalSessionState['status']) {
  if (!status) return '未连接'
  if (status === 'connected') return '已连接'
  if (status === 'connecting') return '连接中'
  if (status === 'reconnecting') return '重连中'
  if (status === 'error') return '异常'
  if (status === 'disconnected') return '断开'
  return status
}

function filesStatusLabel(status?: FilesSessionState['status']) {
  if (!status) return '未连接'
  if (status === 'connected') return '已连接'
  if (status === 'connecting') return '连接中'
  if (status === 'working') return '处理中'
  if (status === 'error') return '异常'
  if (status === 'disconnected') return '断开'
  return status
}

function nestedPadding(depth: number): CSSProperties {
  return {
    paddingLeft: `${depth * 14 + 8}px`,
  }
}

function TerminalTabPane({
  clusterContext,
  item,
  onErrorMessage,
  onStatusChange,
}: {
  clusterContext: ClusterContext | null
  item: AgentListItem
  onErrorMessage: (message: string) => void
  onStatusChange: (status: TerminalSessionState['status']) => void
}) {
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
    clusterContext,
    onErrorMessage,
  })

  const openTerminalRef = useRef(openTerminal)
  const closeTerminalRef = useRef(closeTerminal)
  const statusChangeRef = useRef(onStatusChange)

  useEffect(() => {
    openTerminalRef.current = openTerminal
    closeTerminalRef.current = closeTerminal
  }, [closeTerminal, openTerminal])

  useEffect(() => {
    statusChangeRef.current = onStatusChange
  }, [onStatusChange])

  useEffect(() => {
    openTerminalRef.current(item)
    return () => {
      closeTerminalRef.current()
    }
  }, [item])

  useEffect(() => {
    const status = terminalSession?.status
    if (!status) return
    statusChangeRef.current(status)
  }, [terminalSession?.status])

  return (
    <div className="h-full">
      <AgentTerminalWorkspace
        onAttachOutput={subscribeTerminalOutput}
        onError={markTerminalError}
        onInput={sendTerminalInput}
        onOpen={() => {
          openTerminal(item)
        }}
        onReady={markTerminalConnected}
        onResize={resizeTerminal}
        session={terminalSession}
      />
    </div>
  )
}

function WebTabPane({ tab }: { tab: WebTab }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-50">
      <div className="flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-3">
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700">在线</span>
        <span className="truncate text-xs text-zinc-600">{tab.url}</span>
        <a
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-xs text-zinc-600 hover:bg-zinc-100"
          href={tab.url}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink size={12} />
          新窗口打开
        </a>
      </div>
      <iframe
        className="h-full w-full border-0"
        key={`${tab.id}:${tab.refreshKey}`}
        src={tab.url}
        title={tab.title}
      />
    </div>
  )
}

function FileTabPane({ tab }: { tab: FileTab }) {
  const canPreviewText = isTextPreviewableFile(tab.title)
  const isMarkdown = isMarkdownLikeFile(tab.title)
  const cacheHint = tab.stale
    ? '缓存预览（后台刷新中）'
    : tab.fromCache
      ? '缓存命中'
      : ''

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {cacheHint ? (
          <div
            className={`mb-3 inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] ${
              tab.stale
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-zinc-200 bg-zinc-50 text-zinc-600'
            }`}
          >
            {cacheHint}
          </div>
        ) : null}
        {tab.loading ? (
          <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
            <LoaderCircle className="mr-2 animate-spin" size={15} />
            正在读取文件...
          </div>
        ) : tab.error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {tab.error}
          </div>
        ) : !canPreviewText ? (
          <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 text-center text-sm text-zinc-500">
            该文件类型暂不支持内嵌预览，请在终端中查看。
          </div>
        ) : isMarkdown ? (
          <AgentMarkdownPreview content={tab.content} />
        ) : (
          <pre className="h-full min-h-[220px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-5 text-zinc-800">
            {tab.content || '文件内容为空'}
          </pre>
        )}
      </div>
    </div>
  )
}

export function AgentConsoleWindowPage() {
  const [searchParams] = useSearchParams()
  const [clusterContext, setClusterContext] = useState<ClusterContext | null>(null)
  const [activeAgentName, setActiveAgentName] = useState(
    () => String(searchParams.get('agentName') || '').trim(),
  )
  const [item, setItem] = useState<AgentListItem | null>(null)
  const [services, setServices] = useState<AgentConsoleServiceItem[]>([])
  const [workspaceRoot, setWorkspaceRoot] = useState('')
  const [message, setMessage] = useState('')
  const [resourceSearch, setResourceSearch] = useState('')
  const [tabs, setTabs] = useState<ConsoleTab[]>(initialTabs)
  const [activeTabId, setActiveTabId] = useState('home')
  const [terminalStates, setTerminalStates] = useState<TerminalTabStateMap>({})

  const [explorerChildren, setExplorerChildren] = useState<ExplorerChildrenMap>({})
  const [explorerExpanded, setExplorerExpanded] = useState<ExplorerFlagMap>({})
  const [explorerLoading, setExplorerLoading] = useState<ExplorerFlagMap>({})
  const [explorerErrors, setExplorerErrors] = useState<ExplorerErrorMap>({})

  const tabSeedRef = useRef(1)
  const defaultExpandedKeyRef = useRef('')
  const rootAutoExpandedKeyRef = useRef('')

  const displayName = useMemo(
    () => item?.aliasName || item?.name || activeAgentName || defaultConsoleTitle,
    [activeAgentName, item?.aliasName, item?.name],
  )

  const {
    closeFiles,
    filesSession,
    openFiles,
    readDirectory,
    readFile,
  } = useAgentFiles({
    clusterContext,
  })

  const explorerRoot: string = fileSystemRootPath
  const defaultWorkingPath = useMemo(
    () =>
      normalizeExplorerPath(
        workspaceRoot ||
          item?.workingDir ||
          filesSession?.currentPath ||
          filesSession?.rootPath ||
          fileSystemRootPath,
      ),
    [filesSession?.currentPath, filesSession?.rootPath, item?.workingDir, workspaceRoot],
  )

  const rootDisplayName = useMemo(() => {
    if (explorerRoot === '/') return '/'
    const segments = explorerRoot.split('/').filter(Boolean)
    return segments[segments.length - 1] || explorerRoot
  }, [explorerRoot])

  const filesStatus = filesSession?.status
  const filesConnected = filesStatus === 'connected'

  useEffect(() => {
    document.title = `${displayName} · ${APP_NAME}`
  }, [displayName])

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [activeTabId, tabs],
  )

  const keyword = resourceSearch.trim().toLowerCase()

  const serviceEntries = useMemo(() => {
    const source = readServiceList(services, item?.access || [])
    if (!keyword) return source
    return source.filter(
      (entry) =>
        entry.label.toLowerCase().includes(keyword) ||
        entry.url.toLowerCase().includes(keyword),
    )
  }, [item?.access, keyword, services])

  const terminalTabs = useMemo(
    () => tabs.filter((tab): tab is TerminalTab => tab.type === 'terminal'),
    [tabs],
  )

  const nextTabId = useCallback((prefix: string) => {
    tabSeedRef.current += 1
    return `${prefix}-${tabSeedRef.current}`
  }, [])

  const openNewTerminalTab = useCallback(() => {
    const id = nextTabId('terminal')
    const index = terminalTabs.length + 1
    setTabs((current) => [
      ...current,
      { id, type: 'terminal', title: `终端 ${index}` },
    ])
    setActiveTabId(id)
  }, [nextTabId, terminalTabs.length])

  const updateTerminalStatus = useCallback((tabId: string, status: TerminalSessionState['status']) => {
    setTerminalStates((current) => {
      if (current[tabId] === status) {
        return current
      }
      return {
        ...current,
        [tabId]: status,
      }
    })
  }, [])

  const openWebTab = useCallback(
    (service: AgentConsoleServiceItem, duplicate = false) => {
      if (!service.enabled) {
        setMessage(service.reason || `${service.label} 暂不可用`)
        return
      }

      const normalizedUrl = String(service.url || '').trim()
      if (!normalizedUrl) {
        setMessage(`${service.label} 暂无可用地址`)
        return
      }

      if (!duplicate) {
        const existing = tabs.find(
          (tab): tab is WebTab =>
            tab.type === 'web' &&
            tab.serviceKey === service.key &&
            tab.url === normalizedUrl,
        )
        if (existing) {
          setActiveTabId(existing.id)
          return
        }
      }

      const id = nextTabId('web')
      setTabs((current) => [
        ...current,
        {
          id,
          type: 'web',
          title: service.label,
          url: normalizedUrl,
          serviceKey: service.key,
          refreshKey: 0,
        },
      ])
      setActiveTabId(id)
    },
    [nextTabId, tabs],
  )

  const closeTab = useCallback(
    (targetId: string) => {
      if (targetId === 'home') return

      setTabs((current) => {
        if (current.length <= 1) return current
        const targetIndex = current.findIndex((tab) => tab.id === targetId)
        if (targetIndex === -1) return current
        const next = current.filter((tab) => tab.id !== targetId)
        if (activeTabId === targetId) {
          const fallback = next[Math.max(0, targetIndex - 1)] || next[0]
          if (fallback) {
            setActiveTabId(fallback.id)
          }
        }
        return next
      })

      setTerminalStates((current) => {
        if (!current[targetId]) return current
        const next = { ...current }
        delete next[targetId]
        return next
      })
    },
    [activeTabId],
  )

  const loadFileTabContent = useCallback(
    async (tabId: string, entry: AgentFileItem, options?: { force?: boolean }) => {
      if (!isTextPreviewableFile(entry.name)) {
        setTabs((current) =>
          current.map((tab) =>
            tab.id === tabId && tab.type === 'file'
              ? {
                  ...tab,
                  loading: false,
                  loaded: true,
                  error: '',
                  content: '',
                  fromCache: false,
                  stale: false,
                }
              : tab,
          ),
        )
        return
      }

      setTabs((current) =>
        current.map((tab) =>
          tab.id === tabId && tab.type === 'file'
            ? {
                ...tab,
                loading: true,
                error: '',
              }
            : tab,
        ),
      )

      try {
        const result = await readFile(entry.path, options)
        setTabs((current) =>
          current.map((tab) =>
            tab.id === tabId && tab.type === 'file'
              ? {
                  ...tab,
                  loading: false,
                  loaded: true,
                  path: result.path,
                  entry: {
                    ...entry,
                    path: result.path,
                  },
                  error: '',
                  content: result.content,
                  fromCache: result.fromCache,
                  stale: result.stale,
                }
              : tab,
          ),
        )

        if (result.stale && !options?.force) {
          void readFile(entry.path, { force: true })
            .then((fresh) => {
              setTabs((current) =>
                current.map((tab) =>
                  tab.id === tabId && tab.type === 'file'
                    ? {
                        ...tab,
                        path: fresh.path,
                        entry: {
                          ...entry,
                          path: fresh.path,
                        },
                        loading: false,
                        loaded: true,
                        error: '',
                        content: fresh.content,
                        fromCache: fresh.fromCache,
                        stale: fresh.stale,
                      }
                    : tab,
                ),
              )
            })
            .catch(() => {})
        }
      } catch (error) {
        const nextError =
          error instanceof Error ? error.message : '读取文件失败'
        setTabs((current) =>
          current.map((tab) =>
            tab.id === tabId && tab.type === 'file'
              ? {
                  ...tab,
                  loading: false,
                  loaded: true,
                  error: nextError,
                  content: '',
                  fromCache: false,
                  stale: false,
                }
              : tab,
          ),
        )
      }
    },
    [readFile],
  )

  const openFileTab = useCallback(
    async (entry: AgentFileItem) => {
      if (entry.type === 'dir') {
        return
      }

      if (entry.type !== 'file') {
        setMessage('当前对象暂不支持预览')
        return
      }

      const existing = tabs.find(
        (tab): tab is FileTab => tab.type === 'file' && tab.path === entry.path,
      )
      if (existing) {
        setActiveTabId(existing.id)
        if (!existing.loaded || existing.error) {
          await loadFileTabContent(existing.id, entry)
        }
        return
      }

      const id = nextTabId('file')
      setTabs((current) => [
        ...current,
        {
          id,
          type: 'file',
          title: entry.name,
          path: entry.path,
          entry,
          loading: true,
          loaded: false,
          error: '',
          content: '',
          fromCache: false,
          stale: false,
        },
      ])
      setActiveTabId(id)
      await loadFileTabContent(id, entry)
    },
    [loadFileTabContent, nextTabId, tabs],
  )

  const ensureDirectoryLoaded = useCallback(
    async (directoryPath: string, options?: { force?: boolean }) => {
      if (!directoryPath) return

      setExplorerLoading((current) => ({
        ...current,
        [directoryPath]: true,
      }))
      setExplorerErrors((current) => {
        if (!current[directoryPath]) return current
        const next = { ...current }
        delete next[directoryPath]
        return next
      })

      try {
        const listing = await readDirectory(directoryPath, options)
        setExplorerChildren((current) => ({
          ...current,
          [listing.path]: listing.items,
          [directoryPath]: listing.items,
        }))
      } catch (error) {
        const nextError =
          error instanceof Error ? error.message : '读取目录失败'
        setExplorerErrors((current) => ({
          ...current,
          [directoryPath]: nextError,
        }))
      } finally {
        setExplorerLoading((current) => ({
          ...current,
          [directoryPath]: false,
        }))
      }
    },
    [readDirectory],
  )

  const toggleDirectory = useCallback(
    (directoryPath: string) => {
      const expanded = Boolean(explorerExpanded[directoryPath])
      const nextExpanded = !expanded

      setExplorerExpanded((current) => ({
        ...current,
        [directoryPath]: nextExpanded,
      }))

      if (nextExpanded && !explorerChildren[directoryPath] && !explorerLoading[directoryPath]) {
        void ensureDirectoryLoaded(directoryPath)
      }
    },
    [ensureDirectoryLoaded, explorerChildren, explorerExpanded, explorerLoading],
  )

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      try {
        const session = await getSealosSession().catch(() => null)
        const nextContext = createClusterContext(session)
        if (!active) return
        setClusterContext(nextContext)
      } catch (error) {
        if (!active) return
        setMessage(error instanceof Error ? error.message : '工作区信息加载失败')
      }
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const applyMessage = (raw: unknown) => {
      const nextAgentName = parseAgentTerminalDesktopMessage(raw)
      if (!nextAgentName) return
      setActiveAgentName(nextAgentName)
      setMessage('')
    }

    const onWindowMessage = (event: MessageEvent) => {
      if (!event.source) return
      applyMessage(event.data)
    }

    window.addEventListener('message', onWindowMessage)

    let cleanupAppListener: (() => void) | undefined
    try {
      const result = addSealosAppEventListener('openDesktopApp', (data: unknown) => {
        applyMessage(data)
      })
      if (typeof result === 'function') {
        cleanupAppListener = result as () => void
      }
    } catch {
      cleanupAppListener = undefined
    }

    return () => {
      window.removeEventListener('message', onWindowMessage)
      cleanupAppListener?.()
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadAgent = async () => {
      if (!clusterContext || !activeAgentName) {
        setItem(null)
        return
      }

      try {
        const [templatePayload, clusterInfo, consolePayload] = await Promise.all([
          listAgentTemplates(),
          getClusterInfo(clusterContext),
          getAgentConsole(activeAgentName, clusterContext),
        ])

        const templates = hydrateTemplateCatalog(templatePayload.items)
        const nextItem =
          mapBackendAgentsToListItems(
            consolePayload?.agent ? [consolePayload.agent] : [],
            templates,
            {
              cluster: clusterInfo.cluster,
              namespace: clusterInfo.namespace,
              kc: clusterInfo.kc,
              server: clusterInfo.server,
              operator: clusterInfo.operator,
              updatedAt: clusterInfo.updatedAt,
            },
          )[0] || null

        if (!active) return

        if (!nextItem) {
          setItem(null)
          setServices([])
          setWorkspaceRoot('')
          setMessage(`未找到名为 ${activeAgentName} 的 Agent 实例。`)
          return
        }

        setItem(nextItem)
        setServices(consolePayload?.services || [])
        setWorkspaceRoot(String(consolePayload?.workspaceRoot || '').trim())
        setMessage('')
      } catch (error) {
        if (!active) return
        setItem(null)
        setServices([])
        setWorkspaceRoot('')
        setMessage(error instanceof Error ? error.message : '读取 Agent 控制台信息失败')
      }
    }

    void loadAgent()

    return () => {
      active = false
    }
  }, [activeAgentName, clusterContext])

  useEffect(() => {
    setExplorerChildren({})
    setExplorerExpanded({})
    setExplorerLoading({})
    setExplorerErrors({})
    defaultExpandedKeyRef.current = ''
    rootAutoExpandedKeyRef.current = ''
  }, [item?.name])

  useEffect(() => {
    if (!item) return
    if (filesSession?.resource.name === item.name) return
    openFiles(item)
  }, [filesSession?.resource.name, item, openFiles])

  useEffect(
    () => () => {
      closeFiles()
    },
    [closeFiles],
  )

  useEffect(() => {
    if (!filesSession || !explorerRoot || !filesConnected) return

    const key = `${filesSession.resource.name}:${explorerRoot}`
    if (rootAutoExpandedKeyRef.current !== key) {
      rootAutoExpandedKeyRef.current = key
      setExplorerExpanded((current) => ({
        ...current,
        [explorerRoot]: true,
      }))
    }

    if (!explorerChildren[explorerRoot] && !explorerLoading[explorerRoot]) {
      void ensureDirectoryLoaded(explorerRoot)
    }
  }, [
    ensureDirectoryLoaded,
    explorerChildren,
    explorerExpanded,
    explorerLoading,
    explorerRoot,
    filesConnected,
    filesSession,
  ])

  useEffect(() => {
    if (!filesSession || !filesConnected || !defaultWorkingPath) return

    const key = `${filesSession.resource.name}:${defaultWorkingPath}`
    if (defaultExpandedKeyRef.current === key) return
    defaultExpandedKeyRef.current = key

    const chain = buildExplorerPathChain(defaultWorkingPath)

    setExplorerExpanded((current) => {
      const next = { ...current }
      for (const path of chain) {
        next[path] = true
      }
      return next
    })

    void (async () => {
      for (const path of chain) {
        try {
          await ensureDirectoryLoaded(path)
        } catch {
          break
        }
      }
    })()
  }, [defaultWorkingPath, ensureDirectoryLoaded, filesConnected, filesSession])

  const contextTitle = useMemo(() => {
    if (!activeTab) return '控制台'
    if (activeTab.type === 'home') return '控制台首页'
    if (activeTab.type === 'terminal') return activeTab.title
    if (activeTab.type === 'file') return activeTab.title
    return activeTab.title
  }, [activeTab])

  const contextSub = useMemo(() => {
    if (!activeTab) return ''
    if (activeTab.type === 'home') {
      return '类似 VSCode：左侧目录树展开/折叠目录，点击文件在右侧 Tab 预览。'
    }
    if (activeTab.type === 'terminal') {
      const status = terminalStates[activeTab.id]
      return status ? `终端状态：${status}` : '独立终端会话，可同时打开多个。'
    }
    if (activeTab.type === 'file') {
      return activeTab.path
    }
    return activeTab.url
  }, [activeTab, terminalStates])

  const contextActions = useMemo(() => {
    if (!activeTab) return null

    if (activeTab.type === 'home') {
      return (
        <button
          className="inline-flex h-8 items-center rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-500"
          onClick={openNewTerminalTab}
          type="button"
        >
          新建终端
        </button>
      )
    }

    if (activeTab.type === 'terminal') {
      return (
        <>
          <button
            className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={openNewTerminalTab}
            type="button"
          >
            新建终端
          </button>
          {serviceEntries.slice(0, 2).map((service) => (
            <button
              className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              key={`terminal-service-${service.key}`}
              onClick={() => {
                openWebTab(service)
              }}
              type="button"
            >
              打开 {service.label}
            </button>
          ))}
        </>
      )
    }

    if (activeTab.type === 'file') {
      return (
        <button
          className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          onClick={() => {
            void loadFileTabContent(activeTab.id, activeTab.entry, { force: true })
          }}
          type="button"
        >
          刷新预览
        </button>
      )
    }

    return (
      <>
        <button
          className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          onClick={() => {
            setTabs((current) =>
              current.map((tab) =>
                tab.id === activeTab.id && tab.type === 'web'
                  ? {
                      ...tab,
                      refreshKey: tab.refreshKey + 1,
                    }
                  : tab,
              ),
            )
          }}
          type="button"
        >
          刷新
        </button>
        <button
          className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          onClick={() => {
            if (activeTab.type !== 'web') return
            openWebTab(
              {
                key: activeTab.serviceKey,
                label: activeTab.title,
                url: activeTab.url,
                enabled: true,
              },
              true,
            )
          }}
          type="button"
        >
          新开 Tab
        </button>
      </>
    )
  }, [
    activeTab,
    loadFileTabContent,
    openNewTerminalTab,
    openWebTab,
    serviceEntries,
  ])

  const runtimeCpu = item?.cpu || '--'
  const runtimeMemory = item?.memory || '--'
  const runtimeStorage = item?.storage || '--'

  const entryMatchesKeyword = useCallback(
    (entry: AgentFileItem) => {
      if (!keyword) return true
      return (
        entry.name.toLowerCase().includes(keyword) ||
        entry.path.toLowerCase().includes(keyword)
      )
    },
    [keyword],
  )

  const hasMatchingDescendant = useCallback(
    (directoryPath: string): boolean => {
      const entries = explorerChildren[directoryPath] || []
      for (const entry of entries) {
        if (entryMatchesKeyword(entry)) {
          return true
        }
        if (entry.type === 'dir' && hasMatchingDescendant(entry.path)) {
          return true
        }
      }
      return false
    },
    [entryMatchesKeyword, explorerChildren],
  )

  const renderDirectoryBranch = useCallback(
    (directoryPath: string, depth: number): ReactNode => {
      const entries = explorerChildren[directoryPath] || []
      if (!entries.length) {
        return null
      }

      return entries.map((entry) => {
        const visible = entryMatchesKeyword(entry) || (entry.type === 'dir' && hasMatchingDescendant(entry.path))
        if (!visible) {
          return null
        }

        if (entry.type === 'dir') {
          const expanded = Boolean(explorerExpanded[entry.path])
          const loadingDir = Boolean(explorerLoading[entry.path])
          const error = explorerErrors[entry.path]

          return (
            <div key={entry.path}>
              <button
                className="flex h-8 w-full items-center gap-1 rounded-md pr-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                onClick={() => {
                  toggleDirectory(entry.path)
                }}
                style={nestedPadding(depth)}
                type="button"
              >
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span className="text-[11px]">📁</span>
                <span className="truncate">{entry.name}</span>
                {loadingDir ? <LoaderCircle className="ml-auto animate-spin text-zinc-400" size={12} /> : null}
              </button>
              {error ? (
                <div className="px-2 py-1 text-[11px] text-rose-600" style={nestedPadding(depth + 1)}>
                  {error}
                </div>
              ) : null}
              {expanded && loadingDir && !(explorerChildren[entry.path] || []).length ? (
                <div className="space-y-1 py-1 pr-2" style={nestedPadding(depth + 1)}>
                  {[0, 1, 2].map((index) => (
                    <div className="h-4 animate-pulse rounded bg-zinc-100" key={`${entry.path}:loading:${index}`} />
                  ))}
                </div>
              ) : null}
              {expanded ? renderDirectoryBranch(entry.path, depth + 1) : null}
            </div>
          )
        }

        return (
          <button
            className="flex h-8 w-full items-center gap-1 rounded-md pr-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
            key={entry.path}
            onClick={() => {
              void openFileTab(entry)
            }}
            style={nestedPadding(depth)}
            type="button"
          >
            <span className="w-[13px]" />
            <span className="text-[11px]">📄</span>
            <span className="truncate">{entry.name}</span>
          </button>
        )
      })
    },
    [
      entryMatchesKeyword,
      explorerChildren,
      explorerErrors,
      explorerExpanded,
      explorerLoading,
      hasMatchingDescendant,
      openFileTab,
      toggleDirectory,
    ],
  )

  const rootExpanded = Boolean(explorerExpanded[explorerRoot])

  return (
    <main className="flex h-screen min-h-screen flex-col bg-[#f5f7fb] text-zinc-900">
      <header className="flex h-14 items-center gap-3 border-b border-zinc-200 bg-white px-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-950">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">⌘</span>
          <span className="truncate">{displayName}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden h-8 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-500 md:inline-flex">
            <Search size={13} />
            控制台模式
          </div>
          <a
            className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            href={item ? `/agents/${item.name}` : '/agents'}
          >
            返回 Agent Hub
          </a>
        </div>
      </header>

      {message ? (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{message}</div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-zinc-200 bg-white xl:border-b-0 xl:border-r">
          <div className="border-b border-zinc-200 px-3 py-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-zinc-900">资源管理器</div>
              <div className="flex items-center gap-1">
                <button
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                  onClick={openNewTerminalTab}
                  title="新建终端"
                  type="button"
                >
                  <Plus size={14} />
                </button>
                <button
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                  onClick={() => {
                    setActiveTabId('home')
                  }}
                  title="控制台首页"
                  type="button"
                >
                  <Home size={14} />
                </button>
              </div>
            </div>
            <label className="flex h-8 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-500">
              <Search size={13} />
              <input
                className="w-full border-0 bg-transparent text-xs text-zinc-700 outline-none"
                onChange={(event) => {
                  setResourceSearch(event.target.value)
                }}
                placeholder="搜索文件、服务、终端"
                value={resourceSearch}
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
            <section>
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500">
                <span>工作目录</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] normal-case tracking-normal text-zinc-500">
                    文件通道：{filesStatusLabel(filesStatus)}
                  </span>
                  <span className="normal-case tracking-normal text-zinc-400">
                    默认：{defaultWorkingPath}
                  </span>
                </div>
              </div>

              <div className="space-y-0.5">
                <button
                  className="flex h-8 w-full items-center gap-1 rounded-md px-2 pr-2 text-left text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                  onClick={() => {
                    toggleDirectory(explorerRoot)
                  }}
                  type="button"
                >
                  {rootExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span className="text-[11px]">📁</span>
                  <span className="truncate">{rootDisplayName}</span>
                  {explorerLoading[explorerRoot] ? (
                    <LoaderCircle className="ml-auto animate-spin text-zinc-400" size={12} />
                  ) : null}
                </button>

                {explorerErrors[explorerRoot] ? (
                  <div className="px-2 py-1 text-[11px] text-rose-600" style={nestedPadding(1)}>
                    {explorerErrors[explorerRoot]}
                  </div>
                ) : null}
                {rootExpanded && explorerLoading[explorerRoot] && !(explorerChildren[explorerRoot] || []).length ? (
                  <div className="space-y-1 py-1 pr-2" style={nestedPadding(1)}>
                    {[0, 1, 2].map((index) => (
                      <div className="h-4 animate-pulse rounded bg-zinc-100" key={`root-loading:${index}`} />
                    ))}
                  </div>
                ) : null}

                {rootExpanded ? renderDirectoryBranch(explorerRoot, 1) : null}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500">
                <span>运行服务</span>
                <span className="normal-case tracking-normal text-zinc-400">{serviceEntries.length} 个</span>
              </div>
              <div className="space-y-2">
                {serviceEntries.length ? (
                  serviceEntries.map((service) => (
                    <button
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50/40"
                      key={`${service.key}:${service.url}`}
                      onClick={() => {
                        openWebTab(service)
                      }}
                      type="button"
                    >
                      <div className="text-xs font-medium text-zinc-900">{service.label}</div>
                      <div className="mt-1 truncate text-[11px] text-zinc-500">{service.url}</div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-200 px-2.5 py-2 text-xs text-zinc-400">
                    当前没有可用服务地址
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500">
                <span>终端会话</span>
                <button
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50"
                  onClick={openNewTerminalTab}
                  type="button"
                >
                  新建
                </button>
              </div>
              <div className="space-y-1">
                {terminalTabs.length ? (
                  terminalTabs.map((tab) => {
                    const active = tab.id === activeTabId
                    const statusLabel = terminalStatusLabel(terminalStates[tab.id])
                    return (
                      <button
                        className={`flex h-8 w-full items-center rounded-lg px-2 text-left text-xs ${
                          active
                            ? 'bg-blue-50 font-medium text-blue-700'
                            : 'text-zinc-700 hover:bg-zinc-50'
                        }`}
                        key={tab.id}
                        onClick={() => {
                          setActiveTabId(tab.id)
                        }}
                        type="button"
                      >
                        <span className="truncate">▰ {tab.title}</span>
                        <span className="ml-auto text-[10px] text-zinc-400">{statusLabel}</span>
                      </button>
                    )
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-200 px-2.5 py-2 text-xs text-zinc-400">
                    暂无终端会话
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500">资源状态</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2">
                  <div className="text-[10px] text-zinc-400">CPU</div>
                  <div className="mt-1 text-xs font-semibold text-zinc-900">{runtimeCpu}</div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2">
                  <div className="text-[10px] text-zinc-400">内存</div>
                  <div className="mt-1 text-xs font-semibold text-zinc-900">{runtimeMemory}</div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2">
                  <div className="text-[10px] text-zinc-400">存储</div>
                  <div className="mt-1 text-xs font-semibold text-zinc-900">{runtimeStorage}</div>
                </div>
              </div>
            </section>
          </div>
        </aside>

        <section className="min-h-0 min-w-0 bg-white">
          <div className="flex h-11 border-b border-zinc-200">
            <div className="flex min-w-0 flex-1 overflow-x-auto">
              {tabs.map((tab) => {
                const TabIcon = iconForTab(tab)
                const active = tab.id === activeTabId
                return (
                  <button
                    className={`group flex h-11 min-w-[150px] max-w-[240px] items-center gap-2 border-r border-zinc-200 px-3 text-left text-xs ${
                      active
                        ? 'bg-blue-50 font-semibold text-zinc-900'
                        : 'bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                    key={tab.id}
                    onClick={() => {
                      setActiveTabId(tab.id)
                    }}
                    type="button"
                  >
                    <TabIcon size={14} />
                    <span className="truncate">{tab.title}</span>
                    {tab.id !== 'home' ? (
                      <span
                        className="ml-auto hidden h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 group-hover:inline-flex"
                        onClick={(event) => {
                          event.stopPropagation()
                          closeTab(tab.id)
                        }}
                      >
                        ×
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            <button
              className="inline-flex h-11 w-11 items-center justify-center border-l border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
              onClick={openNewTerminalTab}
              title="新建终端 Tab"
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex min-h-[52px] items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              {activeTab ? (() => {
                const ActiveIcon = iconForTab(activeTab)
                return <ActiveIcon size={15} />
              })() : <Home size={15} />}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900">{contextTitle}</div>
              <div className="truncate text-xs text-zinc-500">{contextSub}</div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">{contextActions}</div>
          </div>

          <div className="relative min-h-0 h-[calc(100%-96px)]">
            {activeTab?.type === 'home' ? (
              <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                <section className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-blue-50 p-5">
                  <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-zinc-900">Agent 控制台</h1>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    这是全新的 Agent 专用控制台：左侧目录树管理资源，右侧多 Tab 承载文件预览、终端和 Web 服务。
                  </p>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="text-sm font-semibold text-zinc-900">运行概览</div>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                      <div className="text-zinc-500">实例名称</div>
                      <div className="mt-1 font-mono text-zinc-700">{item?.name || '--'}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                      <div className="text-zinc-500">命名空间</div>
                      <div className="mt-1 font-mono text-zinc-700">{item?.namespace || '--'}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                      <div className="text-zinc-500">模型</div>
                      <div className="mt-1 font-medium text-zinc-800">{item?.model || '--'}</div>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab?.type === 'file' ? (
              <FileTabPane tab={activeTab} />
            ) : null}

            {item
              ? terminalTabs.map((tab) => (
                  <div
                    className={
                      activeTab?.id === tab.id
                        ? 'relative h-full min-h-0 p-3'
                        : 'pointer-events-none absolute inset-0 h-full min-h-0 p-3 opacity-0'
                    }
                    key={tab.id}
                  >
                    <TerminalTabPane
                      clusterContext={clusterContext}
                      item={item}
                      onErrorMessage={setMessage}
                      onStatusChange={(status) => {
                        updateTerminalStatus(tab.id, status)
                      }}
                    />
                  </div>
                ))
              : null}

            {activeTab?.type === 'web' ? (
              <WebTabPane tab={activeTab} />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}
