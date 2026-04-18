import type { AgentListItem } from '../../../../domains/agents/types'
import { openSealosDesktopApp } from '../../../../sealosSdk'

export const AGENTHUB_TERMINAL_APP_KEY =
  import.meta.env.VITE_AGENTHUB_TERMINAL_APP_KEY || 'user-agenthub-terminal'
export const AGENTHUB_TERMINAL_ROUTE = '/desktop/terminal'
export const AGENTHUB_TERMINAL_MESSAGE_TYPE = 'AgentHubTerminalWindow'

export const openAgentTerminalDesktopWindow = async (item: AgentListItem) => {
  await openCurrentAgentHubTerminalWindow(item)
}

export const openCurrentAgentHubTerminalWindow = async (item: AgentListItem) => {
  const agentName = String(item.name || '').trim()
  if (!agentName) {
    throw new Error('缺少 Agent 实例名称，无法打开终端窗口。')
  }

  await openSealosDesktopApp({
    appKey: AGENTHUB_TERMINAL_APP_KEY,
    pathname: AGENTHUB_TERMINAL_ROUTE,
    query: {
      agentName,
    },
    messageData: {
      type: AGENTHUB_TERMINAL_MESSAGE_TYPE,
      agentName,
      aliasName: item.aliasName || item.name,
    },
    appSize: 'normal',
  })
}
