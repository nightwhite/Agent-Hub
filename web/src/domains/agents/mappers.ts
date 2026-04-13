import {
  AGENT_TEMPLATES,
  inferTemplateIdFromImage,
  mapRawStatusToRuntimeStatus,
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
    item?.yaml?.metadata?.labels?.id ||
      item?.yaml?.metadata?.labels?.['agent.sealos.io/name'] ||
      '--',
  )

export const findResourceGroup = (resources: ResourceCollection, name: string): ResourceGroup => {
  const devbox = resources.devbox.find((entry) => entry.name === name) || null
  const service = resources.service.find((entry) => entry.name === name) || null
  const ingress =
    resources.ingress.find(
      (entry) => entry.yaml?.spec?.rules?.[0]?.http?.paths?.[0]?.backend?.service?.name === name,
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
  const devboxYaml = (devbox?.yaml || {}) as Record<string, any>
  const serviceYaml = (service?.yaml || {}) as Record<string, any>
  const ingressYaml = (ingress?.yaml || {}) as Record<string, any>
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
    state: devboxYaml?.spec?.state || 'Running',
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
    serviceType: serviceYaml?.spec?.type || 'ClusterIP',
    protocol: appPorts[0]?.protocol || servicePorts[0]?.protocol || 'TCP',
    user: devbox?.owner || 'admin',
    workingDir: devboxYaml?.spec?.config?.workingDir || AGENT_TEMPLATES[templateId].defaultWorkingDirectory,
    argsText: Array.isArray(args) ? args.join(' ') : AGENT_TEMPLATES[templateId].defaultArgs.join(' '),
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
      namespace: blueprint.namespace,
      labelId: getLabelId(resourceGroup.devbox || item),
      owner: item.owner,
      status: runtimeStatus,
      statusText: item.status,
      updatedAt: item.updatedAt,
      cpu: blueprint.cpu,
      memory: blueprint.memory,
      storage: blueprint.storageLimit,
      apiUrl: blueprint.apiUrl,
      apiKey: blueprint.apiKey || item.apiKey || '',
      templateId: blueprint.productType,
      template,
      resourceGroup,
      rawStatus: item.status,
      yaml: item.yaml,
    }
  })
