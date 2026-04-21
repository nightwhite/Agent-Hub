import { useCallback, useEffect, useRef, useState } from 'react'
import { buildAgentWebSocketUrl } from '../../../../api'
import type {
  AgentFileItem,
  AgentListItem,
  ClusterContext,
  FilesSessionState,
} from '../../../../domains/agents/types'

type FilesMessage = {
  type?: string
  requestId?: string
  data?: Record<string, unknown>
}

type PendingRequest = {
  resolve: (data: Record<string, unknown>) => void
  reject: (error: Error) => void
}

type DirectoryListing = {
  path: string
  items: AgentFileItem[]
  fetchedAt: number
}

const fallbackRootPath = '/'
const directoryCacheTTL = 45 * 1000
const markdownPreviewExtensions = new Set(['md', 'markdown', 'mdx'])
const textPreviewExtensions = new Set([
  'txt',
  'json',
  'yaml',
  'yml',
  'js',
  'jsx',
  'ts',
  'tsx',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'xml',
  'svg',
  'csv',
  'log',
  'ini',
  'toml',
  'env',
  'py',
  'sh',
  'bash',
  'zsh',
  'sql',
  'java',
  'go',
  'rs',
  'conf',
  'properties',
  'dockerignore',
  'gitignore',
  'lock',
  'text',
])
const imagePreviewExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])
const browserPreviewExtensions = new Set(['pdf'])
const namedTextFiles = new Set(['readme', 'license', 'dockerfile', 'makefile'])

const normalizePath = (value: string, fallback: string) => {
  const raw = String(value || '').trim()
  if (!raw) return fallback
  const normalized = raw.replace(/\/+/g, '/').replace(/\/+$/, '')
  return normalized || fallback
}

const resolveInitialDirectory = (resource: AgentListItem) => {
  const raw = String(resource.template.defaultWorkingDirectory || '').trim()
  if (!raw) return fallbackRootPath
  if (raw.startsWith('/')) {
    return normalizePath(raw, fallbackRootPath)
  }
  return normalizePath(`/${raw.replace(/^\/+/, '')}`, fallbackRootPath)
}

const createFilesSession = (resource: AgentListItem): FilesSessionState => ({
  resource,
  status: 'initializing',
  error: '',
  podName: '',
  containerName: '',
  namespace: '',
  wsUrl: '',
  rootPath: fallbackRootPath,
  currentPath: resolveInitialDirectory(resource),
  items: [],
  selectedItem: null,
  openedItem: null,
  detailMode: 'preview',
  previewContent: '',
  draftContent: '',
  previewObjectUrl: '',
  previewObjectType: '',
  activity: '文件初始化中...',
  browsing: false,
  previewing: false,
  reading: false,
  saving: false,
  downloading: false,
  uploading: false,
  dirty: false,
})

const sortEntries = (items: AgentFileItem[]) =>
  [...items].sort((left, right) => {
    if (left.type === 'dir' && right.type !== 'dir') return -1
    if (left.type !== 'dir' && right.type === 'dir') return 1
    return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
  })

const buildDirectoryListing = (response: Record<string, unknown>, requestedPath: string): DirectoryListing => {
  const resolvedPath = String(response.path || requestedPath)
  const items = Array.isArray(response.items)
    ? sortEntries(
        response.items.map((entry) => {
          const item = entry as Record<string, unknown>
          const name = String(item.name || '')
          const type = String(item.type || 'other')
          return {
            name,
            path: joinFilePath(resolvedPath, name),
            type: type === 'dir' || type === 'file' ? type : 'other',
            size: Number(item.size || 0),
          } satisfies AgentFileItem
        }),
      )
    : []

  return {
    path: resolvedPath,
    items,
    fetchedAt: Date.now(),
  }
}

const isDirectoryListingFresh = (listing: DirectoryListing) => Date.now() - listing.fetchedAt < directoryCacheTTL

const joinFilePath = (basePath: string, childName: string) => {
  const normalizedBase = normalizePath(basePath, fallbackRootPath)
  const normalizedChild = String(childName || '').replace(/^\/+/, '')
  if (!normalizedChild) return normalizedBase
  if (normalizedBase === fallbackRootPath) {
    return `/${normalizedChild}`
  }
  return `${normalizedBase}/${normalizedChild}`
}

const parentFilePath = (currentPath: string) => {
  const normalizedCurrent = normalizePath(currentPath || fallbackRootPath, fallbackRootPath)
  if (normalizedCurrent === fallbackRootPath) {
    return fallbackRootPath
  }

  const next = normalizedCurrent.split('/').slice(0, -1).join('/')
  return next || fallbackRootPath
}

const resolveNavigationPath = (raw: string, currentPath: string): string => {
  const normalizedCurrent = normalizePath(currentPath || fallbackRootPath, fallbackRootPath)
  const value = String(raw || '').trim()

  if (!value || value === '.') {
    return normalizedCurrent
  }

  if (value.startsWith('/')) {
    return normalizePath(value, '/')
  }

  const baseSegments = normalizedCurrent.split('/').filter(Boolean)
  const segments = [...baseSegments]
  const tokens = value.replace(/^\/+/, '').split('/')

  for (const token of tokens) {
    const part = token.trim()
    if (!part || part === '.') continue
    if (part === '..') {
      if (segments.length > 0) {
        segments.pop()
      }
      continue
    }
    segments.push(part)
  }

  return normalizePath(`/${segments.join('/')}`, '/')
}

const decodeBase64ToBytes = (value: string) => {
  const binary = window.atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

const encodeChunkToBase64 = (chunk: Uint8Array) => {
  let binary = ''
  const step = 0x8000

  for (let index = 0; index < chunk.length; index += step) {
    binary += String.fromCharCode(...chunk.subarray(index, index + step))
  }

  return window.btoa(binary)
}

const sanitizeNameInput = (value: string) =>
  String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')

const getFileExtension = (value = '') => {
  const match = String(value || '').toLowerCase().match(/\.([^.]+)$/)
  return match?.[1] || ''
}

const isTextPreviewableFile = (value = '') => {
  const normalizedValue = String(value || '').trim().toLowerCase()
  const extension = getFileExtension(value)
  if (markdownPreviewExtensions.has(extension) || textPreviewExtensions.has(extension)) {
    return true
  }
  return namedTextFiles.has(normalizedValue)
}

const isImagePreviewableFile = (value = '') => imagePreviewExtensions.has(getFileExtension(value))

const isBrowserPreviewableFile = (value = '') => browserPreviewExtensions.has(getFileExtension(value))

const inferMimeType = (filePath = '') => {
  const extension = getFileExtension(filePath)
  const mimeMap: Record<string, string> = {
    md: 'text/markdown;charset=utf-8',
    markdown: 'text/markdown;charset=utf-8',
    mdx: 'text/markdown;charset=utf-8',
    txt: 'text/plain;charset=utf-8',
    json: 'application/json;charset=utf-8',
    yml: 'text/yaml;charset=utf-8',
    yaml: 'text/yaml;charset=utf-8',
    env: 'text/plain;charset=utf-8',
    csv: 'text/csv;charset=utf-8',
    html: 'text/html;charset=utf-8',
    htm: 'text/html;charset=utf-8',
    xml: 'application/xml;charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    pdf: 'application/pdf',
  }

  return mimeMap[extension] || 'application/octet-stream'
}

const revokeObjectUrl = (value = '') => {
  if (value) {
    URL.revokeObjectURL(value)
  }
}

interface UseAgentFilesOptions {
  clusterContext: ClusterContext | null
}

export function useAgentFiles({ clusterContext }: UseAgentFilesOptions) {
  const [filesSession, setFilesSession] = useState<FilesSessionState | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const requestSeqRef = useRef(0)
  const browseRequestSeqRef = useRef(0)
  const directoryVersionRef = useRef(0)
  const authSentRef = useRef(false)
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map())
  const pendingDirectoryRequestsRef = useRef<Map<string, Promise<DirectoryListing>>>(new Map())
  const directoryCacheRef = useRef<Map<string, DirectoryListing>>(new Map())
  const filesSessionRef = useRef<FilesSessionState | null>(null)

  const syncSession = useCallback((updater: (current: FilesSessionState | null) => FilesSessionState | null) => {
    setFilesSession((current) => {
      const next = updater(current)
      filesSessionRef.current = next
      return next
    })
  }, [])

  const nextRequestId = useCallback((prefix = 'file') => {
    requestSeqRef.current += 1
    return `${prefix}-${Date.now()}-${requestSeqRef.current}`
  }, [])

  const rejectPendingRequests = useCallback((message: string) => {
    pendingRequestsRef.current.forEach(({ reject }) => reject(new Error(message)))
    pendingRequestsRef.current.clear()
  }, [])

  const closeFilesSocket = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    authSentRef.current = false

    if (socket && socket.readyState <= WebSocket.OPEN) {
      socket.close(1000, 'manual-close')
    }
  }, [])

  const sendRequest = useCallback(
    (type: string, data: Record<string, unknown>) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const socket = socketRef.current
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          reject(new Error('文件连接尚未建立'))
          return
        }

        const requestId = nextRequestId(type)
        pendingRequestsRef.current.set(requestId, { resolve, reject })

        socket.send(
          JSON.stringify({
            type,
            requestId,
            data,
          }),
        )
      }),
    [nextRequestId],
  )

  const ensureDiscardChanges = useCallback(() => {
    const current = filesSessionRef.current
    if (!current?.dirty) return true
    return window.confirm('当前文件尚未保存，确定放弃修改吗？')
  }, [])

  const resetDirectoryListings = useCallback(() => {
    browseRequestSeqRef.current += 1
    directoryVersionRef.current += 1
    pendingDirectoryRequestsRef.current.clear()
    directoryCacheRef.current.clear()
  }, [])

  const invalidateDirectoryListing = useCallback((targetPath?: string) => {
    directoryVersionRef.current += 1
    if (!targetPath) {
      pendingDirectoryRequestsRef.current.clear()
      directoryCacheRef.current.clear()
      return
    }

    const normalizedTarget = String(targetPath || '').replace(/\/+$/, '') || fallbackRootPath
    for (const key of Array.from(pendingDirectoryRequestsRef.current.keys())) {
      const normalizedKey = key.replace(/\/+$/, '') || fallbackRootPath
      if (normalizedKey === normalizedTarget || normalizedKey.startsWith(`${normalizedTarget}/`)) {
        pendingDirectoryRequestsRef.current.delete(key)
      }
    }

    for (const key of Array.from(directoryCacheRef.current.keys())) {
      const normalizedKey = key.replace(/\/+$/, '') || fallbackRootPath
      if (normalizedKey === normalizedTarget || normalizedKey.startsWith(`${normalizedTarget}/`)) {
        directoryCacheRef.current.delete(key)
      }
    }
  }, [])

  const resetOpenedState = useCallback((options?: { preserveSelection?: boolean }) => {
    let previousObjectUrl = ''

    syncSession((session) => {
      if (!session) return session
      previousObjectUrl = session.previewObjectUrl || ''

      return {
        ...session,
        selectedItem: options?.preserveSelection ? session.selectedItem : null,
        openedItem: null,
        detailMode: 'preview',
        previewContent: '',
        draftContent: '',
        previewObjectUrl: '',
        previewObjectType: '',
        previewing: false,
        reading: false,
        saving: false,
        downloading: false,
        dirty: false,
      }
    })

    revokeObjectUrl(previousObjectUrl)
  }, [syncSession])

  const selectEntry = useCallback((item: AgentFileItem) => {
    syncSession((session) =>
      session
        ? {
            ...session,
            selectedItem: item,
            error: '',
            activity: item.type === 'dir' ? `已选中目录 ${item.name}` : `已选中 ${item.name}`,
          }
        : session,
    )
  }, [syncSession])

  const applyDirectoryListing = useCallback(
    (
      listing: DirectoryListing,
      options?: { preserveSelectedItem?: boolean; preserveOpenedItem?: boolean },
    ) => {
      syncSession((session) => {
        if (!session) return session

        const selectedMatch =
          options?.preserveSelectedItem && session.selectedItem
            ? listing.items.find((item) => item.path === session.selectedItem?.path) || null
            : null
        const openedMatch =
          options?.preserveOpenedItem && session.openedItem
            ? listing.items.find((item) => item.path === session.openedItem?.path) || null
            : null
        let previousObjectUrl = ''

        if (!openedMatch) {
          previousObjectUrl = session.previewObjectUrl || ''
          window.setTimeout(() => revokeObjectUrl(previousObjectUrl), 0)
        }

        return {
          ...session,
          status: 'connected',
          error: '',
          browsing: false,
          currentPath: listing.path,
          items: listing.items,
          selectedItem: selectedMatch || openedMatch,
          openedItem: openedMatch,
          detailMode: openedMatch ? session.detailMode : 'preview',
          previewContent: openedMatch ? session.previewContent : '',
          draftContent: openedMatch ? session.draftContent : '',
          previewObjectUrl: openedMatch ? session.previewObjectUrl : '',
          previewObjectType: openedMatch ? session.previewObjectType : '',
          dirty: openedMatch ? session.dirty : false,
          previewing: openedMatch ? session.previewing : false,
          reading: openedMatch ? session.reading : false,
          saving: openedMatch ? session.saving : false,
          downloading: openedMatch ? session.downloading : false,
          activity: `已打开目录 ${listing.path}`,
        }
      })
    },
    [syncSession],
  )

  const fetchDirectoryListing = useCallback(
    async (requestedPath: string, options?: { force?: boolean }) => {
      if (!options?.force) {
        const cached = directoryCacheRef.current.get(requestedPath)
        if (cached && isDirectoryListingFresh(cached)) {
          return cached
        }
      }

      const pending = pendingDirectoryRequestsRef.current.get(requestedPath)
      if (pending) {
        return pending
      }

      const directoryVersion = directoryVersionRef.current
      const request = sendRequest('file.list', { path: requestedPath })
        .then((response) => {
          const listing = buildDirectoryListing(response, requestedPath)
          if (directoryVersion === directoryVersionRef.current) {
            directoryCacheRef.current.set(listing.path, listing)
            directoryCacheRef.current.set(requestedPath, listing)
          }
          return listing
        })
        .finally(() => {
          const currentRequest = pendingDirectoryRequestsRef.current.get(requestedPath)
          if (currentRequest === request) {
            pendingDirectoryRequestsRef.current.delete(requestedPath)
          }
        })

      pendingDirectoryRequestsRef.current.set(requestedPath, request)
      return request
    },
    [sendRequest],
  )

  const listDirectory = useCallback(
    async (targetPath?: string, options?: { force?: boolean; preserveSelectedItem?: boolean; preserveOpenedItem?: boolean }) => {
      const current = filesSessionRef.current
      if (!current) return

      const requestedPath = String(targetPath || current.currentPath || current.rootPath || fallbackRootPath)
      browseRequestSeqRef.current += 1
      const browseRequestSeq = browseRequestSeqRef.current

      if (!options?.force) {
        const cached = directoryCacheRef.current.get(requestedPath)
        if (cached && isDirectoryListingFresh(cached)) {
          applyDirectoryListing(cached, options)
          return
        }
      }

      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'working',
              error: '',
              activity: `载入目录 ${requestedPath}...`,
              browsing: true,
            }
          : session,
      )

      try {
        const listing = await fetchDirectoryListing(requestedPath, options)
        if (browseRequestSeq !== browseRequestSeqRef.current) {
          return
        }
        applyDirectoryListing(listing, options)
      } catch (error) {
        if (browseRequestSeq !== browseRequestSeqRef.current) {
          return
        }
        syncSession((session) =>
          session
            ? {
                ...session,
                status: 'error',
                browsing: false,
                error: error instanceof Error ? error.message : '读取目录失败',
                activity: error instanceof Error ? error.message : '读取目录失败',
              }
            : session,
        )
      }
    },
    [applyDirectoryListing, fetchDirectoryListing, syncSession],
  )

  const prefetchDirectory = useCallback(
    (targetPath: string) => {
      const current = filesSessionRef.current
      const requestedPath = String(targetPath || '').trim()
      if (!current || !requestedPath || requestedPath === current.currentPath) {
        return
      }

      void fetchDirectoryListing(requestedPath).catch(() => {})
    },
    [fetchDirectoryListing],
  )

  const refreshDirectory = useCallback(() => {
    const current = filesSessionRef.current
    if (!current) return
    void listDirectory(current.currentPath, { force: true, preserveSelectedItem: true, preserveOpenedItem: true })
  }, [listDirectory])

  const loadTextFile = useCallback(
    async (item: AgentFileItem, mode: 'preview' | 'edit') => {
      let previousObjectUrl = ''

      syncSession((session) =>
        session
            ? {
                ...session,
                status: 'working',
                error: '',
                selectedItem: item,
                openedItem: item,
                detailMode: mode,
                previewing: mode === 'preview',
                reading: mode === 'edit',
              previewObjectType: '',
              previewContent: '',
              draftContent: '',
              dirty: false,
              activity:
                mode === 'edit'
                  ? `载入 ${item.name}...`
                  : `预览 ${item.name}...`,
            }
          : session,
      )

      syncSession((session) => {
        if (!session) return session
        previousObjectUrl = session.previewObjectUrl || ''
        if (!previousObjectUrl) return session
        return {
          ...session,
          previewObjectUrl: '',
        }
      })
      revokeObjectUrl(previousObjectUrl)

      try {
        const response = await sendRequest('file.read', { path: item.path })
        const content = String(response.content || '')
        const resolvedPath = String(response.path || item.path)

        syncSession((session) =>
          session
            ? {
                ...session,
                status: 'connected',
                selectedItem: {
                  ...item,
                  path: resolvedPath,
                },
                openedItem: {
                  ...item,
                  path: resolvedPath,
                },
                detailMode: mode,
                previewing: false,
                reading: false,
                previewContent: content,
                draftContent: content,
                dirty: false,
                activity:
                  mode === 'edit'
                    ? `正在编辑 ${item.name}`
                    : `已打开 ${item.name} 的预览`,
              }
            : session,
        )
      } catch (error) {
        syncSession((session) =>
          session
            ? {
                ...session,
                status: 'error',
                previewing: false,
                reading: false,
                error: error instanceof Error ? error.message : '读取文件失败',
                activity: error instanceof Error ? error.message : '读取文件失败',
              }
            : session,
        )
      }
    },
    [sendRequest, syncSession],
  )

  const loadBinaryPreview = useCallback(
    async (item: AgentFileItem) => {
      let previousObjectUrl = ''

      syncSession((session) =>
        session
            ? {
                ...session,
                status: 'working',
                error: '',
                selectedItem: item,
                openedItem: item,
                detailMode: 'preview',
                previewing: true,
              reading: false,
              previewContent: '',
              draftContent: '',
              previewObjectType: '',
              dirty: false,
              activity: `预览 ${item.name}...`,
            }
          : session,
      )

      syncSession((session) => {
        if (!session) return session
        previousObjectUrl = session.previewObjectUrl || ''
        if (!previousObjectUrl) return session
        return {
          ...session,
          previewObjectUrl: '',
        }
      })
      revokeObjectUrl(previousObjectUrl)

      try {
        const response = await sendRequest('file.download', { path: item.path })
        const content = String(response.content || '')
        const resolvedPath = String(response.path || item.path)
        const bytes = decodeBase64ToBytes(content)
        const blob = new Blob([bytes], {
          type: inferMimeType(resolvedPath),
        })
        const objectUrl = URL.createObjectURL(blob)

        syncSession((session) =>
          session
            ? {
                ...session,
                status: 'connected',
                selectedItem: {
                  ...item,
                  path: resolvedPath,
                  size: blob.size || item.size,
                },
                openedItem: {
                  ...item,
                  path: resolvedPath,
                  size: blob.size || item.size,
                },
                previewing: false,
                previewObjectUrl: objectUrl,
                previewObjectType: blob.type,
                activity: `已打开 ${item.name}`,
              }
            : session,
        )
      } catch (error) {
        syncSession((session) =>
          session
            ? {
                ...session,
                status: 'error',
                previewing: false,
                error: error instanceof Error ? error.message : '文件预览失败',
                activity: error instanceof Error ? error.message : '文件预览失败',
              }
            : session,
        )
      }
    },
    [sendRequest, syncSession],
  )

  const previewEntry = useCallback(async (item: AgentFileItem) => {
    if (item.type === 'dir') {
      if (!ensureDiscardChanges()) return
      syncSession((session) =>
        session
          ? {
              ...session,
              selectedItem: item,
            }
          : session,
      )
      resetOpenedState({ preserveSelection: true })
      await listDirectory(item.path)
      return
    }

    if (item.type !== 'file') {
      if (!ensureDiscardChanges()) return
      resetOpenedState({ preserveSelection: true })
      syncSession((session) =>
        session
          ? {
            ...session,
              selectedItem: item,
              openedItem: null,
              error: '',
              activity: '当前对象不支持预览。',
            }
          : session,
      )
      return
    }

    const current = filesSessionRef.current
    if (!current) return

    if (current.openedItem?.path === item.path) {
      syncSession((session) =>
        session
          ? {
              ...session,
              selectedItem: item,
              detailMode: 'preview',
              error: '',
              activity: `已打开 ${item.name}`,
            }
          : session,
      )
      return
    }

    if (!ensureDiscardChanges()) return

    if (isTextPreviewableFile(item.name)) {
      await loadTextFile(item, 'preview')
      return
    }

    if (isImagePreviewableFile(item.name) || isBrowserPreviewableFile(item.name)) {
      await loadBinaryPreview(item)
      return
    }

    resetOpenedState({ preserveSelection: true })
    syncSession((session) =>
      session
        ? {
            ...session,
            selectedItem: item,
            openedItem: null,
            error: '',
            activity: '当前文件不支持内嵌预览。',
          }
        : session,
    )
  }, [ensureDiscardChanges, listDirectory, loadBinaryPreview, loadTextFile, resetOpenedState, syncSession])

  const editEntry = useCallback(async (item: AgentFileItem) => {
    if (item.type === 'dir') {
      if (!ensureDiscardChanges()) return
      syncSession((session) =>
        session
          ? {
              ...session,
              selectedItem: item,
            }
          : session,
      )
      resetOpenedState({ preserveSelection: true })
      await listDirectory(item.path)
      return
    }

    if (item.type !== 'file') {
      return
    }

    if (!isTextPreviewableFile(item.name)) {
      resetOpenedState({ preserveSelection: true })
      syncSession((session) =>
        session
          ? {
              ...session,
              selectedItem: item,
              openedItem: null,
              error: '当前文件不支持在线编辑。',
              activity: '当前文件不支持在线编辑。',
            }
          : session,
      )
      return
    }

    const current = filesSessionRef.current
    if (!current) return

    if (current.openedItem?.path === item.path) {
      syncSession((session) =>
        session
          ? {
              ...session,
              selectedItem: item,
              detailMode: 'edit',
              previewing: false,
              reading: false,
              draftContent: session.dirty ? session.draftContent : session.previewContent,
              error: '',
              activity: `编辑 ${item.name}`,
            }
          : session,
      )
      return
    }

    if (!ensureDiscardChanges()) return
    await loadTextFile(item, 'edit')
  }, [ensureDiscardChanges, listDirectory, loadTextFile, resetOpenedState, syncSession])

  const openEntry = useCallback(async (item: AgentFileItem) => {
    await previewEntry(item)
  }, [previewEntry])

  const openParentDirectory = useCallback(async () => {
    const current = filesSessionRef.current
    if (!current) return
    if (!ensureDiscardChanges()) return
    resetOpenedState()
    await listDirectory(parentFilePath(current.currentPath))
  }, [ensureDiscardChanges, listDirectory, resetOpenedState])

  const jumpToPath = useCallback(async (rawPath: string) => {
    const current = filesSessionRef.current
    if (!current) return
    if (!ensureDiscardChanges()) return
    resetOpenedState()
    await listDirectory(resolveNavigationPath(rawPath, current.currentPath))
  }, [ensureDiscardChanges, listDirectory, resetOpenedState])

  const updateSelectedContent = useCallback((value: string) => {
    syncSession((session) =>
      session
        ? {
            ...session,
            draftContent: value,
            dirty: session.openedItem?.type === 'file' ? value !== session.previewContent : false,
          }
        : session,
    )
  }, [syncSession])

  const saveSelectedFile = useCallback(async () => {
    const current = filesSessionRef.current
    if (!current?.openedItem || current.openedItem.type !== 'file') return
    if (!isTextPreviewableFile(current.openedItem.name)) return
    const activeItem = current.openedItem

    syncSession((session) =>
      session
        ? {
              ...session,
              status: 'working',
              error: '',
              saving: true,
              activity: `保存 ${activeItem.name}...`,
            }
          : session,
      )

    try {
      await sendRequest('file.write', {
        path: activeItem.path,
        content: current.draftContent,
      })
      invalidateDirectoryListing(current.currentPath)

      const nextSize = new Blob([current.draftContent]).size
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'connected',
              saving: false,
              previewContent: session.draftContent,
              items: session.items.map((item) =>
                item.path === activeItem.path
                  ? {
                      ...item,
                      size: nextSize,
                    }
                  : item,
              ),
              selectedItem:
                session.selectedItem && session.selectedItem.path === activeItem.path
                  ? {
                      ...session.selectedItem,
                      size: nextSize,
                    }
                  : session.selectedItem,
              openedItem:
                session.openedItem && session.openedItem.path === activeItem.path
                  ? {
                      ...session.openedItem,
                      size: nextSize,
                    }
                  : session.openedItem,
              dirty: false,
              activity: `已保存 ${activeItem.path}`,
            }
          : session,
      )

      await listDirectory(current.currentPath, {
        force: true,
        preserveSelectedItem: true,
        preserveOpenedItem: true,
      })
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
                status: 'error',
                saving: false,
                error: error instanceof Error ? error.message : '保存文件失败',
                activity: error instanceof Error ? error.message : '保存文件失败',
              }
            : session,
        )
      }
  }, [invalidateDirectoryListing, listDirectory, sendRequest, syncSession])

  const createEmptyFile = useCallback(async (name: string) => {
    const current = filesSessionRef.current
    const nextName = sanitizeNameInput(name)
    if (!current || !nextName) return

    const path = joinFilePath(current.currentPath, nextName)
    invalidateDirectoryListing(current.currentPath)

    syncSession((session) =>
      session
          ? {
              ...session,
              status: 'working',
              error: '',
              activity: `创建文件 ${nextName}...`,
            }
          : session,
      )

      try {
      await sendRequest('file.write', {
          path,
          content: '',
        })
      await listDirectory(current.currentPath, { force: true })
      await editEntry({
        name: nextName,
        path,
        size: 0,
        type: 'file',
      })
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
                status: 'error',
                error: error instanceof Error ? error.message : '创建文件失败',
                activity: error instanceof Error ? error.message : '创建文件失败',
              }
            : session,
        )
      }
  }, [editEntry, invalidateDirectoryListing, listDirectory, sendRequest, syncSession])

  const createDirectory = useCallback(async (name: string) => {
    const current = filesSessionRef.current
    const nextName = sanitizeNameInput(name)
    if (!current || !nextName) return
    invalidateDirectoryListing(current.currentPath)

    syncSession((session) =>
      session
          ? {
              ...session,
              status: 'working',
              error: '',
              activity: `创建目录 ${nextName}...`,
            }
          : session,
      )

      try {
      await sendRequest('file.mkdir', {
        path: joinFilePath(current.currentPath, nextName),
      })
      await listDirectory(current.currentPath, { force: true })
    } catch (error) {
        syncSession((session) =>
          session
            ? {
              ...session,
              status: 'error',
              error: error instanceof Error ? error.message : '创建目录失败',
              activity: error instanceof Error ? error.message : '创建目录失败',
            }
            : session,
        )
      }
  }, [invalidateDirectoryListing, listDirectory, sendRequest, syncSession])

  const deleteEntry = useCallback(async (path: string) => {
    const current = filesSessionRef.current
    if (!current || !path) return
    invalidateDirectoryListing(current.currentPath)
    invalidateDirectoryListing(path)

    syncSession((session) =>
      session
          ? {
              ...session,
              status: 'working',
              error: '',
              activity: `删除 ${path}...`,
            }
          : session,
      )

    try {
      await sendRequest('file.delete', { path })
      let previousObjectUrl = ''
      syncSession((session) =>
        session
          ? {
              ...session,
              ...(session.openedItem?.path === path
                ? (() => {
                    previousObjectUrl = session.previewObjectUrl || ''
                    return {}
                  })()
                : {}),
              selectedItem:
                session.selectedItem?.path === path
                  ? null
                  : session.selectedItem,
              openedItem:
                session.openedItem?.path === path
                  ? null
                  : session.openedItem,
              detailMode:
                session.openedItem?.path === path ? 'preview' : session.detailMode,
              previewContent:
                session.openedItem?.path === path ? '' : session.previewContent,
              draftContent:
                session.openedItem?.path === path ? '' : session.draftContent,
              previewObjectUrl:
                session.openedItem?.path === path
                  ? ''
                  : session.previewObjectUrl,
              previewObjectType:
                session.openedItem?.path === path
                  ? ''
                  : session.previewObjectType,
              dirty: session.openedItem?.path === path ? false : session.dirty,
              activity: `已删除 ${path}`,
            }
          : session,
      )
      revokeObjectUrl(previousObjectUrl)
      await listDirectory(current.currentPath, { force: true })
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              error: error instanceof Error ? error.message : '删除失败',
              activity: error instanceof Error ? error.message : '删除失败',
            }
          : session,
      )
    }
  }, [invalidateDirectoryListing, listDirectory, sendRequest, syncSession])

  const downloadEntry = useCallback(async (path: string) => {
    if (!path) return

    syncSession((session) =>
      session
          ? {
              ...session,
              status: 'working',
              error: '',
              downloading: true,
              activity: `下载 ${path}...`,
            }
          : session,
      )

    try {
      const response = await sendRequest('file.download', { path })
      const content = String(response.content || '')
      const downloadPath = String(response.path || path)
      const filename = downloadPath.split('/').filter(Boolean).pop() || 'download.dat'
      const bytes = decodeBase64ToBytes(content)
      const blob = new Blob([bytes], {
        type: inferMimeType(downloadPath),
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)

      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'connected',
              downloading: false,
              activity: `下载成功：${filename}`,
            }
          : session,
      )
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              downloading: false,
              error: error instanceof Error ? error.message : '下载失败',
              activity: error instanceof Error ? error.message : '下载失败',
            }
          : session,
      )
    }
  }, [sendRequest, syncSession])

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const current = filesSessionRef.current
    const fileList = Array.from(files || [])
    if (!current || !fileList.length) return
    invalidateDirectoryListing(current.currentPath)

    syncSession((session) =>
      session
          ? {
              ...session,
              status: 'working',
              error: '',
              uploading: true,
              activity: `上传中（${fileList.length} 个文件）...`,
            }
          : session,
      )

      try {
      for (const file of fileList) {
        const uploadID = nextRequestId('upload')
        const targetPath = joinFilePath(current.currentPath, file.name)
        const bytes = new Uint8Array(await file.arrayBuffer())

        await sendRequest('file.upload.begin', {
          id: uploadID,
          path: targetPath,
        })

        const chunkSize = 48 * 1024
        for (let index = 0; index < bytes.length; index += chunkSize) {
          const chunk = bytes.subarray(index, index + chunkSize)
          await sendRequest('file.upload.chunk', {
            id: uploadID,
            chunk: encodeChunkToBase64(chunk),
          })
        }

        await sendRequest('file.upload.end', {
          id: uploadID,
        })
        }

      syncSession((session) =>
        session
          ? {
              ...session,
              uploading: false,
              activity: `上传完成，已写入 ${current.currentPath}`,
            }
          : session,
      )

      await listDirectory(current.currentPath, {
        force: true,
        preserveSelectedItem: true,
        preserveOpenedItem: true,
      })
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              uploading: false,
              error: error instanceof Error ? error.message : '上传失败',
              activity: error instanceof Error ? error.message : '上传失败',
            }
          : session,
      )
    }
  }, [invalidateDirectoryListing, listDirectory, nextRequestId, sendRequest, syncSession])

  const connectFiles = useCallback(async (resource: AgentListItem) => {
    if (!clusterContext?.kubeconfig) {
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              error: '未读取到 kubeconfig，无法建立文件连接。',
            }
          : session,
      )
      return
    }

    syncSession((session) =>
      session
          ? {
              ...session,
              status: 'connecting',
              error: '',
              activity: '连接中...',
            }
          : session,
      )

    const encodedKubeconfig = encodeURIComponent(clusterContext.kubeconfig)
    const wsUrl = buildAgentWebSocketUrl(resource.name)
    const socket = new WebSocket(wsUrl)

    closeFilesSocket()
    socketRef.current = socket
    authSentRef.current = false

    const sendAuth = () => {
      if (socket.readyState !== WebSocket.OPEN || authSentRef.current) return
      authSentRef.current = true

      socket.send(
        JSON.stringify({
          type: 'auth',
          requestId: nextRequestId('auth'),
          data: {
            authorization: encodedKubeconfig,
          },
        }),
      )
    }

    socket.addEventListener('message', (event) => {
      let messagePayload: FilesMessage | null = null

      try {
        messagePayload = JSON.parse(String(event.data || '{}'))
      } catch {
        return
      }

      const data = messagePayload?.data || {}
      const requestId = String(messagePayload?.requestId || '')

      switch (messagePayload?.type) {
        case 'auth.required': {
          sendAuth()
          break
        }
        case 'system.ready': {
          syncSession((session) =>
            session
              ? {
                  ...session,
                  status: 'connected',
                  error: '',
                  wsUrl,
                  podName: String(data.podName || ''),
                  containerName: String(data.container || ''),
                  namespace: String(data.namespace || session.namespace || ''),
                  activity: '已连接。',
                }
              : session,
          )
          const current = filesSessionRef.current
          void listDirectory(current?.currentPath || current?.rootPath || fallbackRootPath)
          break
        }
        case 'file.result': {
          if (!requestId) break
          const pending = pendingRequestsRef.current.get(requestId)
          if (!pending) break
          pendingRequestsRef.current.delete(requestId)
          pending.resolve(data)
          break
        }
        case 'error': {
          if (String(data.code || '') === 'already_authenticated') {
            break
          }

          const error = new Error(String(data.message || '文件连接失败'))
          if (requestId) {
            const pending = pendingRequestsRef.current.get(requestId)
            if (pending) {
              pendingRequestsRef.current.delete(requestId)
              pending.reject(error)
              break
            }
          }

          syncSession((session) =>
            session
              ? {
                  ...session,
                  status: 'error',
                  error: error.message,
                  activity: error.message,
                }
              : session,
          )
          break
        }
        default:
          break
      }
    })

    socket.addEventListener('error', () => {
      rejectPendingRequests('文件连接异常，请重试。')
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              error: '文件连接异常，请重试。',
              activity: '文件连接异常，请重试。',
            }
          : session,
      )
    })

    socket.addEventListener('close', (event) => {
      rejectPendingRequests(
        event.code && event.code !== 1000 ? `文件连接已关闭（code=${event.code}）` : '文件连接已关闭',
      )

      syncSession((session) =>
        session
          ? {
              ...session,
              status: session.status === 'error' ? session.status : 'disconnected',
              error:
                session.error || (event.code && event.code !== 1000 ? `文件连接已关闭（code=${event.code}）` : ''),
              activity:
                event.code && event.code !== 1000
                  ? `文件连接已关闭（code=${event.code}）`
                  : '文件连接已关闭',
            }
          : session,
      )

      if (socketRef.current === socket) {
        socketRef.current = null
        authSentRef.current = false
      }
    })
  }, [closeFilesSocket, clusterContext?.kubeconfig, listDirectory, nextRequestId, rejectPendingRequests, syncSession])

  useEffect(() => {
    const resource = filesSession?.resource
    if (!resource) return

    void connectFiles(resource)

    return () => {
      closeFilesSocket()
    }
  }, [closeFilesSocket, connectFiles, filesSession?.resource])

  useEffect(
    () => () => {
      closeFilesSocket()
      rejectPendingRequests('文件连接已关闭')
    },
    [closeFilesSocket, rejectPendingRequests],
  )

  const openFiles = useCallback((item: AgentListItem) => {
    resetDirectoryListings()
    browseRequestSeqRef.current = 0
    const next = createFilesSession(item)
    filesSessionRef.current = next
    setFilesSession(next)
  }, [resetDirectoryListings])

  const closeFiles = useCallback(() => {
    resetDirectoryListings()
    closeFilesSocket()
    rejectPendingRequests('文件连接已关闭')
    revokeObjectUrl(filesSessionRef.current?.previewObjectUrl || '')
    filesSessionRef.current = null
    setFilesSession(null)
  }, [closeFilesSocket, rejectPendingRequests, resetDirectoryListings])

  return {
    closeFiles,
    createDirectory,
    createEmptyFile,
    deleteEntry,
    downloadEntry,
    editEntry,
    filesSession,
    jumpToPath,
    listDirectory,
    openEntry,
    openFiles,
    openParentDirectory,
    prefetchDirectory,
    previewEntry,
    refreshDirectory,
    saveSelectedFile,
    selectEntry,
    updateSelectedContent,
    uploadFiles,
  }
}
