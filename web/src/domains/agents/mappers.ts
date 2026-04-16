import {
  AGENT_TEMPLATES,
  inferTemplateIdFromImage,
  mapRawStatusToRuntimeStatus,
  resolveTemplateById,
  resolveResourcePreset,
} from './templates'
import type {
  AgentBlueprint,
  AgentListItem,
  ClusterInfo,
  ResourceCollection,
  ResourceGroup,
  ResourceItem,
} from './types'

type BackendAgentItem = {
  agentName: string
  templateId?: string
  aliasName?: string
  namespace: string
  status: string
  cpu: string
  memory: string
  storage: string
  workingDir?: string
  modelProvider: string
  modelBaseURL: string
  model: string
  hasModelAPIKey: boolean
  ingressDomain?: string
  apiBaseURL?: string
  ready?: boolean
  bootstrapPhase?: string
  bootstrapMessage?: string
  createdAt?: string
}

type LabelMap = Record<string, string>

type DevboxYaml = {
  metadata?: { namespace?: string; labels?: LabelMap }
  spec?: {
    config?: {
      env?: Array<{ name?: string; value?: string }>
      appPorts?: Array<{ port?: number; protocol?: string }>
      args?: string[]
      workingDir?: string
    }
    network?: { extraPorts?: Array<{ containerPort?: number }> }
    image?: string
    state?: string
    runtimeClassName?: string
    storageLimit?: string
    resource?: { cpu?: string; memory?: string }
  }
}

type ServiceYaml = {
  metadata?: { namespace?: string }
  spec?: {
    type?: 'ClusterIP'
    ports?: Array<{ port?: number; targetPort?: number; protocol?: 'TCP' }>
  }
}

type IngressYaml = {
  metadata?: { namespace?: string; labels?: LabelMap }
  spec?: {
    rules?: Array<{
      host?: string
      http?: {
        paths?: Array<{
          backend?: {
            service?: {
              name?: string
              port?: { number?: number }
            }
          }
        }>
      }
    }>
  }
}

const getResourceLabels = (item?: ResourceItem | null): LabelMap =>
  ((item?.yaml as { metadata?: { labels?: LabelMap } } | undefined)?.metadata?.labels || {}) as LabelMap

const getIngressYaml = (item?: ResourceItem | null): IngressYaml =>
  ((item?.yaml || {}) as IngressYaml)

export const normalizeName = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)

export const ensureDns1035Name = (value: string, fallback = 'agent') => {
  const normalized = normalizeName(value) || normalizeName(fallback) || 'agent'
  const candidate = /^[a-z]/.test(normalized) ? normalized : `a${normalized}`
  return candidate.slice(0, 63).replace(/^-+|-+$/g, '') || 'agent'
}

export const splitArgsText = (value = '') =>
  value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)

export const getLabelId = (item?: ResourceItem | null) =>
  String(
    getResourceLabels(item).id ||
      getResourceLabels(item)['agent.sealos.io/name'] ||
      '--',
  )

export const findResourceGroup = (resources: ResourceCollection, name: string): ResourceGroup => {
  const devbox = resources.devbox.find((entry) => entry.name === name) || null
  const service = resources.service.find((entry) => entry.name === name) || null
  const ingress =
    resources.ingress.find(
      (entry) => getIngressYaml(entry).spec?.rules?.[0]?.http?.paths?.[0]?.backend?.service?.name === name,
    ) ||
    resources.ingress.find((entry) => entry.name === name) ||
    resources.ingress.find((entry) => entry.name === `network-${normalizeName(name)}`) ||
    null

  return { devbox, service, ingress }
}

export const createBlueprintFromResourceGroup = ({
  devbox,
  service,
  ingress,
  fallbackNamespace,
}: ResourceGroup & { fallbackNamespace?: string }): AgentBlueprint => {
  const devboxYaml = (devbox?.yaml || {}) as DevboxYaml
  const serviceYaml = (service?.yaml || {}) as ServiceYaml
  const ingressYaml = (ingress?.yaml || {}) as IngressYaml
  const host = ingressYaml?.spec?.rules?.[0]?.host || ''
  const envList = devboxYaml?.spec?.config?.env || []
  const appPorts = devboxYaml?.spec?.config?.appPorts || []
  const servicePorts = serviceYaml?.spec?.ports || []
  const args = devboxYaml?.spec?.config?.args || []
  const image = devboxYaml?.spec?.image || devbox?.image || AGENT_TEMPLATES['hermes-agent'].image
  const templateId = inferTemplateIdFromImage(image)

  const apiKey = envList.find((env: { name?: string; value?: string }) => env.name === 'API_SERVER_KEY')?.value || ''
  const apiUrl = host ? `https://${host}/v1` : ''

  return {
    appName: devbox?.name || service?.name || ingress?.name || '',
    aliasName: devbox?.name || service?.name || ingress?.name || '',
    namespace:
      devboxYaml?.metadata?.namespace ||
      serviceYaml?.metadata?.namespace ||
      ingressYaml?.metadata?.namespace ||
      fallbackNamespace ||
      '',
    apiKey,
    apiUrl,
    domainPrefix:
      ingressYaml?.metadata?.labels?.['cloud.sealos.io/app-deploy-manager-domain'] ||
      host.split('.')[0] ||
      '',
    fullDomain: host,
    image,
    productType: templateId,
    state: devboxYaml?.spec?.state === 'Paused' ? 'Paused' : 'Running',
    runtimeClassName: devboxYaml?.spec?.runtimeClassName || 'devbox-runtime',
    storageLimit: devboxYaml?.spec?.storageLimit || '10Gi',
    port:
      appPorts[0]?.port ||
      servicePorts[0]?.port ||
      ingressYaml?.spec?.rules?.[0]?.http?.paths?.[0]?.backend?.service?.port?.number ||
      8642,
    cpu: devboxYaml?.spec?.resource?.cpu || '2000m',
    memory: devboxYaml?.spec?.resource?.memory || '4096Mi',
    profile: resolveResourcePreset(
      devboxYaml?.spec?.resource?.cpu || '2000m',
      devboxYaml?.spec?.resource?.memory || '4096Mi',
    ),
    serviceType: 'ClusterIP',
    protocol: appPorts[0]?.protocol === 'TCP' || servicePorts[0]?.protocol === 'TCP' ? 'TCP' : 'TCP',
    user: devbox?.owner || 'admin',
    workingDir: devboxYaml?.spec?.config?.workingDir || AGENT_TEMPLATES[templateId].defaultWorkingDirectory,
    argsText: Array.isArray(args) ? args.join(' ') : AGENT_TEMPLATES[templateId].defaultArgs.join(' '),
    modelProvider: AGENT_TEMPLATES[templateId].defaultModelProvider,
    modelBaseURL: AGENT_TEMPLATES[templateId].defaultModelBaseURL,
    model: AGENT_TEMPLATES[templateId].defaultModel,
    hasModelAPIKey: false,
  }
}

export const mapResourcesToAgentListItems = (
  resources: ResourceCollection,
  clusterInfo: ClusterInfo | null,
): AgentListItem[] =>
  resources.devbox.map((item) => {
    const resourceGroup = findResourceGroup(resources, item.name)
    const blueprint = createBlueprintFromResourceGroup({
      ...resourceGroup,
      fallbackNamespace: clusterInfo?.namespace,
    })
    const template = AGENT_TEMPLATES[blueprint.productType]
    const runtimeStatus = mapRawStatusToRuntimeStatus(item.status)

    return {
      id: item.id,
      name: item.name,
      aliasName: blueprint.aliasName,
      namespace: blueprint.namespace,
      labelId: getLabelId(resourceGroup.devbox || item),
      owner: item.owner,
      status: runtimeStatus,
      statusText: item.status,
      updatedAt: item.updatedAt,
      cpu: blueprint.cpu,
      memory: blueprint.memory,
      storage: blueprint.storageLimit,
      workingDir: blueprint.workingDir,
      apiUrl: blueprint.apiUrl,
      apiKey: blueprint.apiKey || item.apiKey || '',
      templateId: blueprint.productType,
      template,
      resourceGroup,
      rawStatus: item.status,
      modelProvider: blueprint.modelProvider,
      modelBaseURL: blueprint.modelBaseURL,
      model: blueprint.model,
      hasModelAPIKey: blueprint.hasModelAPIKey,
      ready: runtimeStatus === 'running',
      bootstrapPhase: '',
      bootstrapMessage: '',
      chatAvailable: Boolean(blueprint.apiKey),
      chatDisabledReason: blueprint.apiKey ? '' : '当前实例未暴露可直接使用的 API Key。',
      terminalAvailable: runtimeStatus === 'running',
      terminalDisabledReason: runtimeStatus === 'running' ? '' : '当前实例未处于可用状态。',
      yaml: item.yaml,
    }
  })

const createDomainParts = (apiBaseURL = '') => {
  if (!apiBaseURL) {
    return { domainPrefix: '', fullDomain: '' }
  }

  try {
    const target = new URL(apiBaseURL)
    return {
      domainPrefix: target.hostname.split('.')[0] || '',
      fullDomain: target.hostname,
    }
  } catch {
    return { domainPrefix: '', fullDomain: '' }
  }
}

export const createBlueprintFromAgentItem = (item: AgentListItem): AgentBlueprint => {
  const { domainPrefix, fullDomain } = createDomainParts(item.apiUrl)

  return {
    appName: item.name,
    aliasName: item.aliasName || item.name,
    namespace: item.namespace,
    apiKey: item.apiKey || '后端安全策略：不回显',
    apiUrl: item.apiUrl,
    domainPrefix,
    fullDomain,
    image: item.template.image,
    productType: item.templateId,
    state: item.rawStatus === 'Paused' ? 'Paused' : 'Running',
    runtimeClassName: 'devbox-runtime',
    storageLimit: item.storage,
    port: item.template.port,
    cpu: item.cpu,
    memory: item.memory,
    profile: resolveResourcePreset(item.cpu, item.memory),
    serviceType: 'ClusterIP',
    protocol: 'TCP',
    user: item.owner,
    workingDir: item.workingDir || item.template.defaultWorkingDirectory,
    argsText: item.template.defaultArgs.join(' '),
    modelProvider: item.modelProvider,
    modelBaseURL: item.modelBaseURL,
    model: item.model,
    hasModelAPIKey: item.hasModelAPIKey,
  }
}

export const mapBackendAgentsToListItems = (
  items: BackendAgentItem[],
  clusterInfo: ClusterInfo | null,
): AgentListItem[] =>
  (Array.isArray(items) ? items : []).map((item) => {
    const templateId =
      item.templateId && item.templateId in AGENT_TEMPLATES
        ? (item.templateId as AgentListItem['templateId'])
        : resolveTemplateById('hermes-agent').id
    const template = AGENT_TEMPLATES[templateId]
    const runtimeStatus = mapRawStatusToRuntimeStatus(item.status)
    const bootstrapMessage = String(item.bootstrapMessage || '').trim()
    const ready = Boolean(item.ready)
    const chatAvailable = ready && Boolean(item.apiBaseURL)
    const terminalAvailable = ready

    return {
      id: item.agentName,
      name: item.agentName,
      aliasName: item.aliasName || '',
      namespace: item.namespace || clusterInfo?.namespace || '',
      labelId: item.namespace || '--',
      owner: clusterInfo?.operator || 'Sealos',
      status: runtimeStatus,
      statusText: item.status,
      updatedAt: item.createdAt || '',
      cpu: item.cpu,
      memory: item.memory,
      storage: item.storage,
      workingDir: item.workingDir || template.defaultWorkingDirectory,
      apiUrl: item.apiBaseURL || '',
      apiKey: '',
      templateId,
      template,
      resourceGroup: {
        devbox: null,
        service: null,
        ingress: null,
      },
      rawStatus: item.status,
      modelProvider: item.modelProvider,
      modelBaseURL: item.modelBaseURL,
      model: item.model,
      hasModelAPIKey: Boolean(item.hasModelAPIKey),
      ready,
      bootstrapPhase: item.bootstrapPhase || '',
      bootstrapMessage,
      chatAvailable,
      chatDisabledReason: chatAvailable
        ? ''
        : bootstrapMessage || (item.apiBaseURL ? '当前实例尚未完成初始化。' : '当前实例还没有可用的公网 API 地址。'),
      terminalAvailable,
      terminalDisabledReason: terminalAvailable ? '' : bootstrapMessage || '当前实例尚未完成初始化。',
      yaml: {
        agentName: item.agentName,
        aliasName: item.aliasName || '',
        namespace: item.namespace,
        ingressDomain: item.ingressDomain || '',
      },
    }
  })
