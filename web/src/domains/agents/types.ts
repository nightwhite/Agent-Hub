export type AgentTemplateId = 'hermes-agent' | 'openclaw'

export type ResourceType = 'devbox' | 'service' | 'ingress'

export type AgentRuntimeStatus = 'running' | 'creating' | 'stopped' | 'error'

export type AgentActionCapability = 'chat' | 'terminal' | 'files'

export interface ResourcePreset {
  id: 'minimum' | 'recommended' | 'luxury' | 'custom'
  label: string
  description: string
  cpu: string
  memory: string
}

export interface AgentModelOption {
  value: string
  label: string
  helper?: string
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
  defaultModelProvider: string
  defaultModelBaseURL: string
  defaultWorkingDirectory: string
  docsLabel: string
  capabilities: AgentActionCapability[]
  availability: 'active' | 'beta'
  availabilityLabel?: string
  backendSupported: boolean
  createDisabledReason?: string
}

export interface AgentBlueprint {
  appName: string
  aliasName: string
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
  modelProvider: string
  modelBaseURL: string
  model: string
  hasModelAPIKey: boolean
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

export interface WorkspaceAIProxyToken {
  id: number
  name: string
  key: string
  status: number
  existed: boolean
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
    metadata?: Record<string, unknown>
    spec?: Record<string, unknown>
    status?: Record<string, unknown>
    [key: string]: unknown
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
  aliasName: string
  namespace: string
  labelId: string
  owner: string
  status: AgentRuntimeStatus
  statusText: string
  updatedAt: string
  cpu: string
  memory: string
  storage: string
  workingDir: string
  apiUrl: string
  apiKey: string
  templateId: AgentTemplateId
  template: AgentTemplateDefinition
  resourceGroup: ResourceGroup
  rawStatus: string
  modelProvider: string
  modelBaseURL: string
  model: string
  hasModelAPIKey: boolean
  ready: boolean
  bootstrapPhase: string
  bootstrapMessage: string
  chatAvailable: boolean
  chatDisabledReason: string
  terminalAvailable: boolean
  terminalDisabledReason: string
  yaml: Record<string, unknown>
}

export interface CreateBlueprintSeed {
  appName: string
  aliasName: string
  namespace: string
  apiKey: string
  apiUrl: string
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

export interface AgentTerminalDescriptor {
  terminalName: string
  iframeUrl: string
  namespace: string
  podName: string
  containerName: string
  command: string
  keepaliveSeconds: number
  availableReplicas: number
}

export interface TerminalSessionState {
  resource: AgentListItem
  status: 'initializing' | 'connecting' | 'reconnecting' | 'connected' | 'disconnected' | 'error'
  error: string
  podName: string
  containerName: string
  namespace: string
  terminalName: string
  iframeUrl: string
  command: string
  keepaliveSeconds: number
  availableReplicas: number
  wsUrl: string
  terminalId: string
  cwd: string
}

export interface AgentFileItem {
  name: string
  path: string
  type: 'file' | 'dir' | 'other'
  size: number
}

export interface FilesSessionState {
  resource: AgentListItem
  status: 'initializing' | 'connecting' | 'connected' | 'working' | 'disconnected' | 'error'
  error: string
  podName: string
  containerName: string
  namespace: string
  wsUrl: string
  rootPath: string
  currentPath: string
  items: AgentFileItem[]
  selectedPath: string
  selectedType: 'file' | 'dir' | 'other' | ''
  selectedContent: string
  dirty: boolean
}
