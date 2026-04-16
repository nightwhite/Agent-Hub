import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addSealosAppEventListener } from '../../../../sealosSdk'
import { parseAgentTerminalDesktopMessage } from '../lib/desktopMessages'
import { AGENTHUB_TERMINAL_ROUTE } from '../lib/terminalWindow'

export function AgentHubDesktopBridge() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const routeToTerminal = (raw: unknown) => {
      const agentName = parseAgentTerminalDesktopMessage(raw)
      if (!agentName) return

      const targetPath = `${AGENTHUB_TERMINAL_ROUTE}?agentName=${encodeURIComponent(agentName)}`
      const currentPath = `${location.pathname}${location.search}`
      if (currentPath === targetPath) {
        return
      }

      navigate(targetPath)
    }

    const onWindowMessage = (event: MessageEvent) => {
      if (!event.source) return
      routeToTerminal(event.data)
    }

    window.addEventListener('message', onWindowMessage)

    let cleanupAppListener: (() => void) | undefined
    try {
      const result = addSealosAppEventListener('openDesktopApp', (data: unknown) => {
        routeToTerminal(data)
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
  }, [location.pathname, location.search, navigate])

  return null
}
