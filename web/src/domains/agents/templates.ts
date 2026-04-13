import hermesAgentLogo from '../../assets/hermes-agent-logo.png'
import openclawLogo from '../../assets/openclaw-logo.jpg'
import type {
  AgentBlueprint,
  AgentRuntimeStatus,
  AgentTemplateDefinition,
  AgentTemplateId,
  CreateBlueprintSeed,
  ResourcePreset,
} from './types'

export const RESOURCE_PRESETS: ResourcePreset[] = [
  {
    id: 'minimum',
    label: '最小',
    description: '1c2g · 轻量运行',
    cpu: '1000m',
    memory: '2048Mi',
  },
  {
    id: 'recommended',
    label: '推荐',
    description: '2c4g · 默认配置',
    cpu: '2000m',
    memory: '4096Mi',
  },
  {
    id: 'luxury',
    label: '豪华',
    description: '4c8g · 更高性能',
    cpu: '4000m',
    memory: '8192Mi',
  },
  {
    id: 'custom',
    label: '自定义',
    description: '手动输入 CPU / 内存',
    cpu: '',
    memory: '',
  },
]

export const AGENT_TEMPLATES: Record<AgentTemplateId, AgentTemplateDefinition> = {
  'hermes-agent': {
    id: 'hermes-agent',
    name: 'Hermes Agent',
    shortName: 'Hermes',
    description: 'OpenAI-compatible Agent 服务，支持部署后直接对话验证和终端调试。',
    logo: hermesAgentLogo,
    brandColor: '#2563eb',
    image: 'nousresearch/hermes-agent:latest',
    port: 8642,
    defaultArgs: ['gateway', 'run'],
    defaultModel: 'hermes-agent',
    defaultWorkingDirectory: '/home/admin',
    docsLabel: '对话 + 终端',
    capabilities: ['chat', 'terminal'],
    availability: 'active',
  },
  openclaw: {
    id: 'openclaw',
    name: 'OpenClaw',
    shortName: 'OpenClaw',
    description: '面向浏览器自动化场景的 Agent Gateway。当前保留创建入口，按 Beta 语义接入。',
    logo: openclawLogo,
    brandColor: '#0f766e',
    image: 'ghcr.io/openclawai/openclaw:latest',
    port: 3000,
    defaultArgs: ['gateway', 'serve'],
    defaultModel: 'openclaw',
    defaultWorkingDirectory: '/app',
    docsLabel: '终端优先',
    capabilities: ['terminal'],
    availability: 'beta',
    availabilityLabel: 'Beta',
  },
}

export const AGENT_TEMPLATE_LIST = Object.values(AGENT_TEMPLATES)

export const DEFAULT_TEMPLATE_ID: AgentTemplateId = 'hermes-agent'

export const DEFAULT_FILE_DIRECTORY = '/home/admin'

export const EMPTY_BLUEPRINT: AgentBlueprint = {
  appName: '',
  namespace: '',
  apiKey: '',
  apiUrl: '',
  domainPrefix: '',
  fullDomain: '',
  image: AGENT_TEMPLATES['hermes-agent'].image,
  productType: 'hermes-agent',
  state: 'Running',
  runtimeClassName: 'devbox-runtime',
  storageLimit: '10Gi',
  port: AGENT_TEMPLATES['hermes-agent'].port,
  cpu: '2000m',
  memory: '4096Mi',
  profile: 'recommended',
  serviceType: 'ClusterIP',
  protocol: 'TCP',
  user: '',
  workingDir: AGENT_TEMPLATES['hermes-agent'].defaultWorkingDirectory,
  argsText: AGENT_TEMPLATES['hermes-agent'].defaultArgs.join(' '),
}

export const resolveResourcePreset = (cpu = '', memory = '') => {
  const match = RESOURCE_PRESETS.find((preset) => preset.cpu === cpu && preset.memory === memory)
  return match?.id || 'custom'
}

export const inferTemplateIdFromImage = (image = ''): AgentTemplateId =>
  /openclaw/i.test(String(image || '')) ? 'openclaw' : 'hermes-agent'

export const resolveTemplateById = (templateId: AgentTemplateId) => AGENT_TEMPLATES[templateId]

export const mapRawStatusToRuntimeStatus = (status = ''): AgentRuntimeStatus => {
  const normalized = String(status || '').toLowerCase()

  if (normalized.includes('running') || normalized.includes('healthy') || normalized.includes('active')) {
    return 'running'
  }

  if (normalized.includes('pending') || normalized.includes('creating') || normalized.includes('initial')) {
    return 'creating'
  }

  if (normalized.includes('paused') || normalized.includes('stop')) {
    return 'stopped'
  }

  return 'error'
}

export const getStatusText = (status: AgentRuntimeStatus) => {
  switch (status) {
    case 'running':
      return '运行中'
    case 'creating':
      return '创建中'
    case 'stopped':
      return '已暂停'
    case 'error':
      return '异常'
  }
}

export const applyTemplateToBlueprint = (
  seed: CreateBlueprintSeed,
  templateId: AgentTemplateId,
): AgentBlueprint => {
  const template = resolveTemplateById(templateId)

  return {
    ...EMPTY_BLUEPRINT,
    appName: seed.appName,
    namespace: seed.namespace,
    apiKey: seed.apiKey,
    apiUrl: `https://${seed.fullDomain}/v1`,
    domainPrefix: seed.domainPrefix,
    fullDomain: seed.fullDomain,
    image: template.image,
    productType: template.id,
    state: seed.state,
    runtimeClassName: seed.runtimeClassName,
    storageLimit: seed.storageLimit,
    port: template.port,
    cpu: EMPTY_BLUEPRINT.cpu,
    memory: EMPTY_BLUEPRINT.memory,
    profile: resolveResourcePreset(EMPTY_BLUEPRINT.cpu, EMPTY_BLUEPRINT.memory),
    serviceType: seed.serviceType,
    protocol: seed.protocol,
    user: seed.user,
    workingDir: template.defaultWorkingDirectory || seed.workingDir,
    argsText: template.defaultArgs.join(' '),
  }
}
