import { useCallback, useEffect, useRef, useState } from 'react'
import { buildAgentWebSocketUrl } from '../../../../api'
import type { AgentFileItem, AgentListItem, ClusterContext, FilesSessionState } from '../../../../domains/agents/types'

type FilesMessage = {
  type?: string
  requestId?: string
  data?: Record<string, unknown>
}

type PendingRequest = {
  resolve: (data: Record<string, unknown>) => void
  reject: (error: Error) => void
}

const fallbackRootPath = '/opt/hermes'

const createFilesSession = (resource: AgentListItem): FilesSessionState => ({
  resource,
  status: 'initializing',
  error: '',
  podName: '',
  containerName: '',
  namespace: '',
  wsUrl: '',
  rootPath: resource.template.defaultWorkingDirectory || fallbackRootPath,
  currentPath: resource.template.defaultWorkingDirectory || fallbackRootPath,
  items: [],
  selectedPath: '',
  selectedType: '',
  selectedContent: '',
  dirty: false,
})

const sortEntries = (items: AgentFileItem[]) =>
  [...items].sort((left, right) => {
    if (left.type === 'dir' && right.type !== 'dir') return -1
    if (left.type !== 'dir' && right.type === 'dir') return 1
    return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
  })

const joinFilePath = (basePath: string, childName: string) => {
  const normalizedBase = String(basePath || '').replace(/\/+$/, '') || fallbackRootPath
  const normalizedChild = String(childName || '').replace(/^\/+/, '')
  if (!normalizedChild) return normalizedBase
  return `${normalizedBase}/${normalizedChild}`
}

const parentFilePath = (currentPath: string, rootPath: string) => {
  const normalizedRoot = String(rootPath || '').replace(/\/+$/, '') || fallbackRootPath
  const normalizedCurrent = String(currentPath || '').replace(/\/+$/, '') || normalizedRoot
  if (normalizedCurrent === normalizedRoot) {
    return normalizedRoot
  }

  const next = normalizedCurrent.split('/').slice(0, -1).join('/')
  return next || normalizedRoot
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

interface UseAgentFilesOptions {
  clusterContext: ClusterContext | null
}

export function useAgentFiles({ clusterContext }: UseAgentFilesOptions) {
  const [filesSession, setFilesSession] = useState<FilesSessionState | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const requestSeqRef = useRef(0)
  const authSentRef = useRef(false)
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map())
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

  const listDirectory = useCallback(
    async (targetPath?: string) => {
      const current = filesSessionRef.current
      if (!current) return

      const requestedPath = String(targetPath || current.currentPath || current.rootPath || fallbackRootPath)

      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'working',
              error: '',
            }
          : session,
      )

      try {
        const response = await sendRequest('file.list', { path: requestedPath })
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

        syncSession((session) => {
          if (!session) return session

          const selectedExists = session.selectedPath
            ? items.some((item) => item.path === session.selectedPath)
            : false

          return {
            ...session,
            status: 'connected',
            currentPath: resolvedPath,
            items,
            selectedPath: selectedExists ? session.selectedPath : '',
            selectedType: selectedExists ? session.selectedType : '',
            selectedContent: selectedExists ? session.selectedContent : '',
            dirty: selectedExists ? session.dirty : false,
          }
        })
      } catch (error) {
        syncSession((session) =>
          session
            ? {
                ...session,
                status: 'error',
                error: error instanceof Error ? error.message : '读取目录失败',
              }
            : session,
        )
      }
    },
    [sendRequest, syncSession],
  )

  const openFile = useCallback(
    async (filePath: string) => {
      if (!ensureDiscardChanges()) return

      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'working',
              error: '',
            }
          : session,
      )

      try {
        const response = await sendRequest('file.read', { path: filePath })
        const content = String(response.content || '')
        const resolvedPath = String(response.path || filePath)

        syncSession((session) =>
          session
            ? {
                ...session,
                status: 'connected',
                selectedPath: resolvedPath,
                selectedType: 'file',
                selectedContent: content,
                dirty: false,
              }
            : session,
        )
      } catch (error) {
        syncSession((session) =>
          session
            ? {
                ...session,
                status: 'error',
                error: error instanceof Error ? error.message : '读取文件失败',
              }
            : session,
        )
      }
    },
    [ensureDiscardChanges, sendRequest, syncSession],
  )

  const openEntry = useCallback(
    async (item: AgentFileItem) => {
      if (item.type === 'dir') {
        if (!ensureDiscardChanges()) return
        await listDirectory(item.path)
        return
      }

      if (item.type === 'file') {
        await openFile(item.path)
      }
    },
    [ensureDiscardChanges, listDirectory, openFile],
  )

  const openParentDirectory = useCallback(async () => {
    const current = filesSessionRef.current
    if (!current) return
    if (!ensureDiscardChanges()) return
    await listDirectory(parentFilePath(current.currentPath, current.rootPath))
  }, [ensureDiscardChanges, listDirectory])

  const updateSelectedContent = useCallback((value: string) => {
    syncSession((session) =>
      session
        ? {
            ...session,
            selectedContent: value,
            dirty: session.selectedType === 'file' ? true : session.dirty,
          }
        : session,
    )
  }, [syncSession])

  const saveSelectedFile = useCallback(async () => {
    const current = filesSessionRef.current
    if (!current?.selectedPath || current.selectedType !== 'file') return

    syncSession((session) =>
      session
        ? {
            ...session,
            status: 'working',
            error: '',
          }
        : session,
    )

    try {
      await sendRequest('file.write', {
        path: current.selectedPath,
        content: current.selectedContent,
      })

      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'connected',
              dirty: false,
            }
          : session,
      )

      await listDirectory(current.currentPath)
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              error: error instanceof Error ? error.message : '保存文件失败',
            }
          : session,
      )
    }
  }, [listDirectory, sendRequest, syncSession])

  const createEmptyFile = useCallback(async (name: string) => {
    const current = filesSessionRef.current
    const nextName = sanitizeNameInput(name)
    if (!current || !nextName) return

    const path = joinFilePath(current.currentPath, nextName)

    syncSession((session) =>
      session
        ? {
            ...session,
            status: 'working',
            error: '',
          }
        : session,
    )

    try {
      await sendRequest('file.write', {
        path,
        content: '',
      })
      await listDirectory(current.currentPath)
      await openFile(path)
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              error: error instanceof Error ? error.message : '创建文件失败',
            }
          : session,
      )
    }
  }, [listDirectory, openFile, sendRequest, syncSession])

  const createDirectory = useCallback(async (name: string) => {
    const current = filesSessionRef.current
    const nextName = sanitizeNameInput(name)
    if (!current || !nextName) return

    syncSession((session) =>
      session
        ? {
            ...session,
            status: 'working',
            error: '',
          }
        : session,
    )

    try {
      await sendRequest('file.mkdir', {
        path: joinFilePath(current.currentPath, nextName),
      })
      await listDirectory(current.currentPath)
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              error: error instanceof Error ? error.message : '创建目录失败',
            }
          : session,
      )
    }
  }, [listDirectory, sendRequest, syncSession])

  const deleteEntry = useCallback(async (path: string) => {
    const current = filesSessionRef.current
    if (!current || !path) return

    syncSession((session) =>
      session
        ? {
            ...session,
            status: 'working',
            error: '',
          }
        : session,
    )

    try {
      await sendRequest('file.delete', { path })
      syncSession((session) =>
        session
          ? {
              ...session,
              selectedPath: session.selectedPath === path ? '' : session.selectedPath,
              selectedType: session.selectedPath === path ? '' : session.selectedType,
              selectedContent: session.selectedPath === path ? '' : session.selectedContent,
              dirty: session.selectedPath === path ? false : session.dirty,
            }
          : session,
      )
      await listDirectory(current.currentPath)
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              error: error instanceof Error ? error.message : '删除失败',
            }
          : session,
      )
    }
  }, [listDirectory, sendRequest, syncSession])

  const downloadEntry = useCallback(async (path: string) => {
    if (!path) return

    syncSession((session) =>
      session
        ? {
            ...session,
            status: 'working',
            error: '',
          }
        : session,
    )

    try {
      const response = await sendRequest('file.download', { path })
      const content = String(response.content || '')
      const downloadPath = String(response.path || path)
      const filename = downloadPath.split('/').filter(Boolean).pop() || 'download.dat'
      const bytes = decodeBase64ToBytes(content)
      const blob = new Blob([bytes])
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
            }
          : session,
      )
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              error: error instanceof Error ? error.message : '下载失败',
            }
          : session,
      )
    }
  }, [sendRequest, syncSession])

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const current = filesSessionRef.current
    const fileList = Array.from(files || [])
    if (!current || !fileList.length) return

    syncSession((session) =>
      session
        ? {
            ...session,
            status: 'working',
            error: '',
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

      await listDirectory(current.currentPath)
    } catch (error) {
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              error: error instanceof Error ? error.message : '上传失败',
            }
          : session,
      )
    }
  }, [listDirectory, nextRequestId, sendRequest, syncSession])

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
      rejectPendingRequests('文件连接异常，请关闭后重新打开。')
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'error',
              error: '文件连接异常，请关闭后重新打开。',
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
    const next = createFilesSession(item)
    filesSessionRef.current = next
    setFilesSession(next)
  }, [])

  const closeFiles = useCallback(() => {
    closeFilesSocket()
    rejectPendingRequests('文件连接已关闭')
    filesSessionRef.current = null
    setFilesSession(null)
  }, [closeFilesSocket, rejectPendingRequests])

  return {
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
  }
}
