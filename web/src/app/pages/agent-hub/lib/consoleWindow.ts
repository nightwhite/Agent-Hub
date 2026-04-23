import type { AgentListItem } from '../../../../domains/agents/types'
import { openSealosDesktopApp } from '../../../../sealosSdk'

export const AGENTHUB_CONSOLE_APP_KEY =
  import.meta.env.VITE_AGENTHUB_CONSOLE_APP_KEY ||
  import.meta.env.VITE_AGENTHUB_TERMINAL_APP_KEY ||
  'user-agenthub-terminal'
export const AGENTHUB_CONSOLE_ROUTE = '/desktop/console'
export const AGENTHUB_CONSOLE_MESSAGE_TYPE = 'AgentHubConsoleWindow'

export const openAgentConsoleDesktopWindow = async (item: AgentListItem) => {
  const agentName = String(item.name || '').trim()
  if (!agentName) {
    throw new Error('缺少 Agent 实例名称，无法打开控制台窗口。')
  }

  await openSealosDesktopApp({
    appKey: AGENTHUB_CONSOLE_APP_KEY,
    pathname: AGENTHUB_CONSOLE_ROUTE,
    query: {
      agentName,
    },
    messageData: {
      type: AGENTHUB_CONSOLE_MESSAGE_TYPE,
      agentName,
      aliasName: item.aliasName || item.name,
    },
    appSize: 'normal',
  })
}

