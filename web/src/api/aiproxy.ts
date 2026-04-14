const DEFAULT_AIPROXY_MANAGER_BASE_URL =
  import.meta.env.VITE_AGENTHUB_AIPROXY_MANAGER_BASE_URL || 'https://aiproxy-web.hzh.sealos.run'

const DEFAULT_AIPROXY_MODEL_BASE_URL =
  import.meta.env.VITE_AGENTHUB_AIPROXY_MODEL_BASE_URL || 'https://aiproxy.hzh.sealos.run'

const deriveAIProxyURL = (server = '', subdomain = '', fallback = '') => {
  if (!server) return fallback

  try {
    const target = new URL(server)
    const host = target.hostname || ''
    if (!host.includes('sealos.')) {
      return fallback
    }
    return `https://${subdomain}.${host}`
  } catch {
    return fallback
  }
}

export const deriveAIProxyManagerBaseURL = (server = '') =>
  deriveAIProxyURL(server, 'aiproxy-web', DEFAULT_AIPROXY_MANAGER_BASE_URL)

export const deriveAIProxyModelBaseURL = (server = '') =>
  deriveAIProxyURL(server, 'aiproxy', DEFAULT_AIPROXY_MODEL_BASE_URL)

