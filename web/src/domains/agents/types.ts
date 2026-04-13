export type AgentTemplateId = 'hermes-agent' | 'openclaw'

export type ResourceType = 'devbox' | 'service' | 'ingress'

export type AgentRuntimeStatus = 'running' | 'creating' | 'stopped' | 'error'

export type AgentActionCapability = 'chat' | 'terminal'

export interface ResourcePreset {
  id: 'minimum' | 'recommended' | 'luxury' | 'custom'
  label: string
  description: string
  cpu: string
  memory: string
}

export interface AgentTemplateDefinition {
  id: AgentTemplateId
  name: string
  shortName: string
  description: string
  logo: string
  brandColor: string
  image: string
  port: number
  defaultArgs: string[]
  defaultModel: string
  defaultWorkingDirectory: string
  docsLabel: string
  capabilities: AgentActionCapability[]
  availability: 'active' | 'beta'
  availabilityLabel?: string
}

export interface AgentBlueprint {
  appName: string
  namespace: string
  apiKey: string
  apiUrl: string
  domainPrefix: string
  fullDomain: string
  image: string
  productType: AgentTemplateId
  state: 'Running' | 'Paused'
  runtimeClassName: string
  storageLimit: string
  port: number
  cpu: string
  memory: string
  profile: ResourcePreset['id']
  serviceType: 'ClusterIP'
  protocol: 'TCP'
  user: string
  workingDir: string
  argsText: string
}

export interface ClusterInfo {
  cluster: string
  namespace: string
  kc: string
  server: string
  operator: string
  updatedAt: string
}

export interface ClusterContext {
  server: string
  namespace: string
  token: string
  sessionToken: string
  authCandidates: Array<{ source: string; token: string }>
  activeAuthToken: string
  activeAuthSource: string
  operator: string
  agentLabel: string
  kubeconfig: string
}

export interface ResourceItem {
  id: string
  name: string
  owner: string
  port: number | string
  status: string
  updatedAt: string
  desc: string
  apiKey: string
  apiUrl: string
  yaml: {
    metadata?: Record<string, any>
    spec?: Record<string, any>
    status?: Record<string, any>
    [key: string]: any
  }
  image?: string
}

export interface ResourceCollection {
  devbox: ResourceItem[]
  service: ResourceItem[]
  ingress: ResourceItem[]
}

export interface ResourceGroup {
  devbox: ResourceItem | null
  service: ResourceItem | null
  ingress: ResourceItem | null
}

export interface AgentListItem {
  id: string
  name: string
  namespace: string
  labelId: string
  owner: string
  status: AgentRuntimeStatus
  statusText: string
  updatedAt: string
  cpu: string
  memory: string
  storage: string
  apiUrl: string
  apiKey: string
  templateId: AgentTemplateId
  template: AgentTemplateDefinition
  resourceGroup: ResourceGroup
  rawStatus: string
  yaml: Record<string, unknown>
}

export interface CreateBlueprintSeed {
  appName: string
  namespace: string
  apiKey: string
  domainPrefix: string
  fullDomain: string
  state: 'Running' | 'Paused'
  runtimeClassName: string
  storageLimit: string
  serviceType: 'ClusterIP'
  protocol: 'TCP'
  user: string
  workingDir: string
  args: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  streaming?: boolean
}

export interface ChatSessionState {
  resource: AgentListItem
  draft: string
  status: 'idle' | 'connecting' | 'connected' | 'error'
  transport: string
  error: string
  triedApiUrls: string[]
  messages: ChatMessage[]
}

export interface TerminalSessionState {
  resource: AgentListItem
  status: 'initializing' | 'connecting' | 'connected' | 'disconnected' | 'error'
  error: string
  podName: string
  containerName: string
  namespace: string
  wsUrl: string
}
