// @ts-nocheck

export const formatDisplayTime = (value) => {
  if (!value) return '--'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export const toKubeconfigScalar = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^['"]|['"]$/g, '')
}

export const encodeHeaderValue = (value = '') => {
  if (!value) return ''

  try {
    return encodeURIComponent(value)
  } catch {
    return ''
  }
}

export const dedupeAuthCandidates = (entries = []) => {
  const seen = new Set()

  return entries.filter((entry) => {
    const token = toKubeconfigScalar(entry?.token)
    if (!token || seen.has(token)) return false
    seen.add(token)
    entry.token = token
    return true
  })
}

export const getNow = () => {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const error = new Error(text || `请求失败: ${response.status}`)
    error.status = response.status
    error.payload = text
    throw error
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

export const createApiError = async (response) => {
  const text = await response.text().catch(() => '')
  let payload = text
  let message = text || `请求失败: ${response.status}`

  if (text) {
    try {
      payload = JSON.parse(text)
      message = payload?.message || message
    } catch {
      payload = text
    }
  }

  const error = new Error(message)
  error.status = response.status
  error.payload = payload
  return error
}

export const requestMaybeConflict = async (url, options = {}) => {
  const response = await fetch(url, options)

  if (response.status === 409) {
    return { conflict: true, data: null }
  }

  if (!response.ok) {
    throw await createApiError(response)
  }

  if (response.status === 204) {
    return { conflict: false, data: null }
  }

  return {
    conflict: false,
    data: await response.json(),
  }
}

export function maskTokenForLog(token = '') {
  if (!token || typeof token !== 'string') {
    return {
      length: 0,
      head: '',
      tail: '',
    }
  }

  return {
    length: token.length,
    head: token.slice(0, 10),
    tail: token.slice(-10),
  }
}

export const isUnauthorizedError = (error) => error?.status === 401

const buildHeaders = (clusterContext) => {
  const encodedKubeconfig = encodeHeaderValue(clusterContext?.kubeconfig || '')
  const encodedDesktopToken = encodeHeaderValue(clusterContext?.sessionToken || '')
  const encodedClusterServer = encodeHeaderValue(clusterContext?.server || '')
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  if (encodedKubeconfig) {
    headers.Authorization = encodedKubeconfig
  }

  if (encodedDesktopToken) {
    headers['Authorization-Bearer'] = encodedDesktopToken
  }

  if (encodedClusterServer) {
    headers['X-K8s-Server'] = encodedClusterServer
  }

  return headers
}

export const buildAuthorizedRequestOptions = (clusterContext, options = {}) => ({
  ...options,
  headers: {
    ...buildHeaders(clusterContext),
    ...(options.headers || {}),
  },
})

export const requestRawWithAuthRetry = async (url, clusterContext, options = {}) => {
  try {
    const response = await fetch(url, buildAuthorizedRequestOptions(clusterContext, options))
    if (!response.ok) {
      throw await createApiError(response)
    }
    return response
  } catch (error) {
    if (isUnauthorizedError(error)) {
      error.message = '请求失败: kubeconfig 认证无效或当前环境未按 Sealos 应用方式代理 Kubernetes 请求'
    }
    throw error
  }
}

export const requestJsonWithAuthRetry = async (url, clusterContext, options = {}) => {
  try {
    return await requestJson(url, buildAuthorizedRequestOptions(clusterContext, options))
  } catch (error) {
    if (isUnauthorizedError(error)) {
      error.message = '请求失败: kubeconfig 认证无效或当前环境未按 Sealos 应用方式代理 Kubernetes 请求'
    }
    throw error
  }
}

export const requestMaybeConflictWithAuthRetry = async (url, clusterContext, options = {}) => {
  try {
    return await requestMaybeConflict(url, buildAuthorizedRequestOptions(clusterContext, options))
  } catch (error) {
    if (isUnauthorizedError(error)) {
      error.message = '请求失败: kubeconfig 认证无效或当前环境未按 Sealos 应用方式代理 Kubernetes 请求'
    }
    throw error
  }
}

export const buildProxyUrl = (path, searchParams) => {
  const query = searchParams?.toString()
  return `/k8s-api${path}${query ? `?${query}` : ''}`
}

export const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const marker = 'base64,'
      const index = result.indexOf(marker)
      resolve(index >= 0 ? result.slice(index + marker.length) : '')
    }
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })

const bytesToBase64 = (bytes = new Uint8Array()) => {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

export const textToBase64 = (value = '') => bytesToBase64(new TextEncoder().encode(String(value || '')))

export const base64ToText = (value = '') => {
  if (!value) return ''
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export const parseContentDispositionFilename = (value = '') => {
  if (!value) return ''

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const asciiMatch = value.match(/filename=\"?([^\";]+)\"?/i)
  return asciiMatch?.[1] || ''
}
