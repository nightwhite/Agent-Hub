import type { AgentListItem } from '../../../../domains/agents/types'
import { openSealosDesktopApp } from '../../../../sealosSdk'

export const CURRENT_AGENTHUB_APP_KEY = import.meta.env.VITE_AGENTHUB_APP_KEY || 'user-agenthub'
export const SYSTEM_TERMINAL_APP_KEY = 'system-terminal'
export const AGENTHUB_TERMINAL_APP_KEY =
  import.meta.env.VITE_AGENTHUB_TERMINAL_APP_KEY || 'user-agenthub-terminal'
export const AGENTHUB_TERMINAL_ROUTE = '/desktop/terminal'
export const AGENTHUB_TERMINAL_MESSAGE_TYPE = 'AgentHubTerminalWindow'

export const openAgentTerminalDesktopWindow = async (item: AgentListItem) => {
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

export const openCurrentAgentHubTerminalWindow = async (item: AgentListItem) => {
  const agentName = String(item.name || '').trim()
  if (!agentName) {
    throw new Error('缺少 Agent 实例名称，无法打开终端窗口。')
  }

  await openSealosDesktopApp({
    appKey: CURRENT_AGENTHUB_APP_KEY,
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

export const openSystemTerminalWindow = async (item: AgentListItem) => {
  const agentName = String(item.name || '').trim()
  const namespace = String(item.namespace || '').trim()

  if (!agentName || !namespace) {
    throw new Error('缺少终端所需的 Pod 或命名空间信息。')
  }
  await openSealosDesktopApp({
    appKey: SYSTEM_TERMINAL_APP_KEY,
    pathname: '/exec',
    query: {
      ns: namespace,
      pod: agentName,
      command: JSON.stringify(['bash']),
    },
    messageData: {
      type: 'InternalAppCall',
      ns: namespace,
      pod: agentName,
      command: ['bash'],
    },
    appSize: 'normal',
  })
}
