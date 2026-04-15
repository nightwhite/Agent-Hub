import { useCallback, useEffect, useRef, useState } from 'react'
import type { ITerminalAddon, Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { buildAgentWebSocketUrl } from '../../../../api'
import type { AgentListItem, ClusterContext, TerminalSessionState } from '../../../../domains/agents/types'

type TerminalMessage = {
  type?: string
  data?: Record<string, unknown>
}

type TerminalLike = {
  cols: number
  rows: number
  write: (value: string) => void
  open: (container: HTMLElement) => void
  focus: () => void
  loadAddon: (addon: ITerminalAddon) => void
  onData: (callback: (value: string) => void) => { dispose?: () => void }
  dispose?: () => void
}

type FitAddonLike = {
  fit: () => void
}

type DisposableLike = {
  dispose?: () => void
}

const createTerminalSession = (resource: AgentListItem): TerminalSessionState => ({
  resource,
  status: 'initializing',
  error: '',
  podName: '',
  containerName: '',
  namespace: '',
  wsUrl: '',
})

const normalizeTerminalCwd = (input: string) => {
  const value = String(input || '')
    .trim()
    .replace(/\\/g, '/')
  const allowedRoots = ['/opt/data/workspace', '/opt/data', '/opt/hermes']

  if (!value || value === '.' || value === '/') {
    return '.'
  }

  if (value.startsWith('/')) {
    const absolute = value.replace(/\/+$/, '') || '/'
    const matchedRoot = allowedRoots.find((root) => absolute === root || absolute.startsWith(`${root}/`))
    if (matchedRoot) {
      return absolute
    }

    return '.'
  }

  const normalized = value.replace(/^\.\/+/, '')
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    return '.'
  }

  return normalized
}

interface UseAgentTerminalOptions {
  clusterContext: ClusterContext | null
}

export function useAgentTerminal({ clusterContext }: UseAgentTerminalOptions) {
  const [terminalSession, setTerminalSession] = useState<TerminalSessionState | null>(null)

  const terminalContainerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<TerminalLike | null>(null)
  const terminalFitAddonRef = useRef<FitAddonLike | null>(null)
  const terminalSocketRef = useRef<WebSocket | null>(null)
  const terminalDataDisposableRef = useRef<DisposableLike | null>(null)
  const terminalRequestSeqRef = useRef(0)
  const terminalSocketSessionIdRef = useRef('')

  const nextTerminalRequestId = useCallback((prefix = 'ws') => {
    terminalRequestSeqRef.current += 1
    return `${prefix}-${Date.now()}-${terminalRequestSeqRef.current}`
  }, [])

  const sendTerminalMessage = useCallback(
    (type: string, data: Record<string, unknown>) => {
      const socket = terminalSocketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) return false

      socket.send(
        JSON.stringify({
          type,
          requestId: nextTerminalRequestId(type),
          data,
        }),
      )

      return true
    },
    [nextTerminalRequestId],
  )

  const sendTerminalResize = useCallback(() => {
    const terminal = terminalRef.current
    const sessionId = terminalSocketSessionIdRef.current
    if (!terminal || !sessionId) return

    sendTerminalMessage('terminal.resize', {
      id: sessionId,
      cols: terminal.cols,
      rows: terminal.rows,
    })
  }, [sendTerminalMessage])

  const closeTerminalSocket = useCallback(() => {
    const socket = terminalSocketRef.current

    terminalSocketRef.current = null
    terminalSocketSessionIdRef.current = ''

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
    terminalRef.current?.write(value)
  }, [])

  const sendTerminalInput = useCallback(
    (input: string) => {
      const sessionId = terminalSocketSessionIdRef.current
      if (!sessionId || typeof input !== 'string' || input.length === 0) return

      sendTerminalMessage('terminal.input', {
        id: sessionId,
        input,
      })
    },
    [sendTerminalMessage],
  )

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

      const encodedKubeconfig = encodeURIComponent(clusterContext.kubeconfig || '')
      if (!encodedKubeconfig) {
        setTerminalSession((current) =>
          current
            ? {
                ...current,
                status: 'error',
                error: '未读取到 kubeconfig，无法建立终端连接。',
              }
            : current,
        )
        return
      }

      setTerminalSession((current) => (current ? { ...current, status: 'connecting', error: '' } : current))
      closeTerminalSocket()

      const wsUrl = buildAgentWebSocketUrl(resource.name)
      const socket = new WebSocket(wsUrl)
      const sessionId = `terminal-${Date.now()}`
      let authSent = false
      let terminalOpened = false

      terminalSocketRef.current = socket
      terminalSocketSessionIdRef.current = sessionId

      const sendAuth = () => {
        if (socket.readyState !== WebSocket.OPEN || authSent) return
        authSent = true

        socket.send(
          JSON.stringify({
            type: 'auth',
            requestId: nextTerminalRequestId('auth'),
            data: {
              authorization: encodedKubeconfig,
            },
          }),
        )
      }

      socket.addEventListener('message', (event) => {
        let messagePayload: TerminalMessage | null = null

        try {
          messagePayload = JSON.parse(String(event.data || '{}'))
        } catch {
          return
        }

        const data = messagePayload?.data || {}

        switch (messagePayload?.type) {
          case 'auth.required': {
            sendAuth()
            break
          }
          case 'system.ready': {
            setTerminalSession((current) =>
              current
                ? {
                    ...current,
                    wsUrl,
                    podName: String(data.podName || ''),
                    containerName: String(data.container || ''),
                    namespace: String(data.namespace || current.namespace || ''),
                  }
                : current,
            )

            if (!terminalOpened) {
              terminalOpened = true
              sendTerminalMessage('terminal.open', {
                id: sessionId,
                cwd: normalizeTerminalCwd(resource.template.defaultWorkingDirectory || '.'),
              })
            }
            break
          }
          case 'terminal.opened': {
            if (String(data.id || '') !== sessionId) return

            setTerminalSession((current) =>
              current
                ? {
                    ...current,
                    status: 'connected',
                    error: '',
                    wsUrl,
                  }
                : current,
            )
            window.setTimeout(() => sendTerminalResize(), 0)
            break
          }
          case 'terminal.output': {
            if (String(data.id || '') !== sessionId) return
            writeTerminalData(String(data.output || ''))
            break
          }
          case 'terminal.closed': {
            if (String(data.id || '') !== sessionId) return
            setTerminalSession((current) =>
              current
                ? {
                    ...current,
                    status: 'disconnected',
                    error: current.error,
                  }
                : current,
            )
            break
          }
          case 'error': {
            if (String(data.code || '') === 'already_authenticated') {
              break
            }
            setTerminalSession((current) =>
              current
                ? {
                    ...current,
                    status: 'error',
                    error: String(data.message || '终端连接失败'),
                  }
                : current,
            )
            break
          }
          default:
            break
        }
      })

      socket.addEventListener('error', () => {
        setTerminalSession((current) =>
          current
            ? {
                ...current,
                status: 'error',
                error: '终端连接异常，请关闭后重新打开。',
              }
            : current,
        )
      })

      socket.addEventListener('close', (event) => {
        setTerminalSession((current) =>
          current
            ? {
                ...current,
                status: current.status === 'error' ? current.status : 'disconnected',
                error: current.error || (event.code && event.code !== 1000 ? `连接已关闭（code=${event.code}）` : ''),
              }
            : current,
        )

        if (terminalSocketRef.current === socket) {
          terminalSocketRef.current = null
          terminalSocketSessionIdRef.current = ''
        }
      })
    },
    [clusterContext, closeTerminalSocket, nextTerminalRequestId, sendTerminalMessage, sendTerminalResize, writeTerminalData],
  )

  useEffect(() => {
    const resource = terminalSession?.resource
    if (!resource || !terminalContainerRef.current) return

    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let onWindowResize: (() => void) | null = null

    const initTerminal = async () => {
      try {
        await import('@xterm/xterm/css/xterm.css')
        const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])

        if (disposed || !terminalContainerRef.current) return

        const terminal: Terminal = new Terminal({
          cursorBlink: true,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
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

        const fitAddon: FitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)
        terminal.open(terminalContainerRef.current)
        fitAddon.fit()
        terminal.focus()

        terminalRef.current = terminal
        terminalFitAddonRef.current = fitAddon

        resizeObserver = new ResizeObserver(() => {
          fitAddon.fit()
          sendTerminalResize()
        })
        resizeObserver.observe(terminalContainerRef.current)

        onWindowResize = () => {
          fitAddon.fit()
          sendTerminalResize()
        }
        window.addEventListener('resize', onWindowResize)

        terminalDataDisposableRef.current = terminal.onData((input: string) => {
          sendTerminalInput(input)
        })

        await connectTerminal(resource)
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
  }, [connectTerminal, disconnectTerminal, sendTerminalInput, sendTerminalResize, terminalSession?.resource])

  useEffect(
    () => () => {
      terminalDataDisposableRef.current?.dispose?.()
      terminalDataDisposableRef.current = null
      closeTerminalSocket()
      terminalRef.current?.dispose?.()
      terminalRef.current = null
      terminalFitAddonRef.current = null
    },
    [closeTerminalSocket],
  )

  const openTerminal = useCallback((item: AgentListItem) => {
    setTerminalSession(createTerminalSession(item))
  }, [])

  const closeTerminal = useCallback(() => {
    disconnectTerminal({ keepSession: false })
  }, [disconnectTerminal])

  return {
    closeTerminal,
    openTerminal,
    terminalContainerRef,
    terminalSession,
  }
}
