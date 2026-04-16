import { requestBackend } from './backend'
import type { AgentTerminalDescriptor, ClusterContext } from '../domains/agents/types'

export const createAgentTerminalSession = async (
  agentName: string,
  clusterContext: ClusterContext,
): Promise<AgentTerminalDescriptor> =>
  requestBackend(`/api/v1/agents/${encodeURIComponent(agentName)}/terminal/session`, clusterContext, {
    method: 'POST',
  })
