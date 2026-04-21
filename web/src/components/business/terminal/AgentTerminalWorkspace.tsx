import '@xterm/xterm/css/xterm.css'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import { LoaderCircle, Terminal as TerminalIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { TerminalSessionState } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'

interface AgentTerminalWorkspaceProps {
  session: TerminalSessionState | null
  onOpen?: () => void
  onReady?: () => void
  onError?: (message: string) => void
  onInput?: (input: string) => void
  onResize?: (cols: number, rows: number) => void
  onAttachOutput?: (listener: (chunk: string) => void) => () => void
}

const statusLabelMap: Record<TerminalSessionState['status'], string> = {
  initializing: '准备中',
  connecting: '连接中',
  reconnecting: '重连中',
  connected: '已连接',
  disconnected: '已断开',
  error: '异常',
}

const terminalTheme = {
  background: '#05070a',
  foreground: '#e5e7eb',
  cursor: '#f8fafc',
  cursorAccent: '#05070a',
  selectionBackground: 'rgba(148, 163, 184, 0.25)',
  black: '#0f172a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e2e8f0',
  brightBlack: '#475569',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#f8fafc',
}

export function AgentTerminalWorkspace({
  session,
  onOpen,
  onReady,
  onError,
  onInput,
  onResize,
  onAttachOutput,
}: AgentTerminalWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeNowRef = useRef<() => void>(() => {})
  const inputHandlerRef = useRef(onInput)
  const resizeHandlerRef = useRef(onResize)
  const readyHandlerRef = useRef(onReady)
  const errorHandlerRef = useRef(onError)
  const detachOutputRef = useRef<(() => void) | null>(null)
  const connectedTerminalIdRef = useRef('')
  const announcedStateRef = useRef('')
  const lastResizeRef = useRef({ cols: 0, rows: 0 })
  const previousStatusRef = useRef<TerminalSessionState['status'] | ''>('')
  const outputQueueRef = useRef<string[]>([])
  const outputFlushFrameRef = useRef<number | null>(null)

  useEffect(() => {
    inputHandlerRef.current = onInput
  }, [onInput])

  useEffect(() => {
    resizeHandlerRef.current = onResize
  }, [onResize])

  useEffect(() => {
    readyHandlerRef.current = onReady
  }, [onReady])

  useEffect(() => {
    errorHandlerRef.current = onError
  }, [onError])

  useEffect(() => {
    connectedTerminalIdRef.current = ''
    announcedStateRef.current = ''
    previousStatusRef.current = ''
  }, [session?.terminalId])

  useEffect(() => {
    if (!session || !containerRef.current) return

    const terminal = new XTerm({
      allowTransparency: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily: '"SF Mono", "SFMono-Regular", ui-monospace, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: terminalTheme,
    })
    const fitAddon = new FitAddon()

    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    terminal.writeln('\x1b[90m正在连接终端...\x1b[0m')

    const resizeNow = () => {
      if (!terminalRef.current || !fitAddonRef.current) return
      fitAddonRef.current.fit()
      const { cols, rows } = terminalRef.current
      if (cols > 0 && rows > 0) {
        if (cols !== lastResizeRef.current.cols || rows !== lastResizeRef.current.rows) {
          lastResizeRef.current = { cols, rows }
          resizeHandlerRef.current?.(cols, rows)
        }
      }
    }

    resizeNowRef.current = resizeNow

    const dataDisposable = terminal.onData((data) => {
      if (!data) return
      inputHandlerRef.current?.(data)
    })

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        resizeNowRef.current()
      })
    })
    resizeObserver.observe(containerRef.current)
    window.requestAnimationFrame(() => {
      resizeNowRef.current()
    })

    if (onAttachOutput) {
      const flushOutputQueue = () => {
        outputFlushFrameRef.current = null
        if (!terminalRef.current || outputQueueRef.current.length === 0) return
        const merged = outputQueueRef.current.join('')
        outputQueueRef.current = []
        if (merged) {
          terminalRef.current.write(merged)
        }
      }

      detachOutputRef.current = onAttachOutput((chunk) => {
        if (!chunk) return
        outputQueueRef.current.push(chunk)
        if (outputFlushFrameRef.current === null) {
          outputFlushFrameRef.current = window.requestAnimationFrame(flushOutputQueue)
        }
      })
    }

    return () => {
      if (outputFlushFrameRef.current !== null) {
        window.cancelAnimationFrame(outputFlushFrameRef.current)
        outputFlushFrameRef.current = null
      }
      outputQueueRef.current = []
      detachOutputRef.current?.()
      detachOutputRef.current = null
      resizeObserver.disconnect()
      dataDisposable.dispose()
      fitAddon.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      resizeNowRef.current = () => {}
      lastResizeRef.current = { cols: 0, rows: 0 }
    }
  }, [onAttachOutput, session?.terminalId])

  useEffect(() => {
    if (!session || !terminalRef.current) return

    const becameConnected = session.status === 'connected' && previousStatusRef.current !== 'connected'
    const switchedTerminal = connectedTerminalIdRef.current !== session.terminalId

    if (session.status === 'connected' && becameConnected) {
      if (switchedTerminal) {
        connectedTerminalIdRef.current = session.terminalId
        terminalRef.current.clear()
      }
      // Force one terminal.resize after each successful connect/reconnect.
      lastResizeRef.current = { cols: 0, rows: 0 }
      terminalRef.current.focus()
      window.requestAnimationFrame(() => {
        resizeNowRef.current()
      })
      readyHandlerRef.current?.()
      previousStatusRef.current = session.status
      return
    }

    if (session.status === 'error' && session.error && announcedStateRef.current !== `error:${session.error}`) {
      announcedStateRef.current = `error:${session.error}`
      terminalRef.current.writeln(`\r\n\x1b[31m${session.error}\x1b[0m`)
      errorHandlerRef.current?.(session.error)
      return
    }

    if (session.status === 'disconnected' && announcedStateRef.current !== 'disconnected') {
      announcedStateRef.current = 'disconnected'
      terminalRef.current.writeln('\r\n\x1b[33m终端连接已关闭。\x1b[0m')
    }
    previousStatusRef.current = session.status
  }, [session])

  if (!session) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <TerminalIcon size={22} />
        </div>
        <div className="mt-4 text-base font-medium text-slate-950">终端</div>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">连接后可直接进入容器环境。</p>
        {onOpen ? (
          <div className="mt-4">
            <Button onClick={onOpen} variant="secondary">
              <TerminalIcon size={16} />
              连接终端
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
          状态: {statusLabelMap[session.status]}
        </span>
        {session.namespace ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            命名空间: {session.namespace}
          </span>
        ) : null}
        {session.podName ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            实例: {session.podName}
          </span>
        ) : null}
        {session.containerName ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            容器: {session.containerName}
          </span>
        ) : null}
        {session.cwd ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono">
            当前目录: {session.cwd}
          </span>
        ) : null}
      </div>

      {session.error ? (
        <div className="px-4 pt-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {session.error}
          </div>
          {onOpen ? (
            <div className="mt-3">
              <Button onClick={onOpen} variant="secondary">
                <TerminalIcon size={16} />
                重新连接
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 px-4 py-4">
        <div className="relative h-full overflow-hidden rounded-xl border border-slate-900 bg-[#05070a] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div
            className="h-full min-h-[360px] w-full bg-[#05070a] [scrollbar-gutter:stable] [&_.xterm]:h-full [&_.xterm-screen]:h-full [&_.xterm-viewport]:overflow-y-auto"
            ref={containerRef}
          />

          {(session.status === 'initializing' || session.status === 'connecting' || session.status === 'reconnecting') && !session.error ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/28">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur">
                <LoaderCircle className="animate-spin" size={16} />
                {session.status === 'reconnecting' ? '恢复连接中...' : '连接中...'}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
