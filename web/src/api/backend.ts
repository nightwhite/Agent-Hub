// @ts-nocheck
import { buildAuthorizedRequestOptions } from './shared'

const BACKEND_BASE_URL = import.meta.env.VITE_AGENTHUB_BACKEND_URL || '/backend-api'

const joinUrlPath = (basePath = '', nextPath = '') => {
  const normalizedBase = String(basePath || '').replace(/\/$/, '')
  const normalizedNext = String(nextPath || '').replace(/^\//, '')
  if (!normalizedBase) return `/${normalizedNext}`
  if (!normalizedNext) return normalizedBase || '/'
  return `${normalizedBase}/${normalizedNext}`
}

const buildBackendUrl = (path = '') => {
  if (typeof window === 'undefined') {
    return `${BACKEND_BASE_URL.replace(/\/$/, '')}/${String(path || '').replace(/^\//, '')}`
  }

  const target = new URL(BACKEND_BASE_URL, window.location.origin)
  target.pathname = joinUrlPath(target.pathname, path)
  return target.toString()
}

const buildBackendWsUrl = (path = '') => {
  const target = new URL(buildBackendUrl(path))
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:'
  return target.toString()
}

const createBackendError = (response, payload) => {
  const message =
    payload?.message ||
    payload?.error?.message ||
    (typeof payload === 'string' ? payload : '') ||
    `请求失败: ${response.status}`

  const error = new Error(message)
  error.status = response.status
  error.payload = payload
  error.requestId = payload?.requestId || ''
  return error
}

export const requestBackend = async (path, clusterContext, options = {}) => {
  const response = await fetch(buildBackendUrl(path), buildAuthorizedRequestOptions(clusterContext, options))
  const text = await response.text().catch(() => '')

  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    throw createBackendError(response, payload)
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  if (payload.code !== 0) {
    throw createBackendError(response, payload)
  }

  return payload.data ?? null
}

export const listAgents = async (clusterContext) => requestBackend('/api/v1/agents', clusterContext, { method: 'GET' })

export const getAgent = async (agentName, clusterContext) =>
  requestBackend(`/api/v1/agents/${encodeURIComponent(agentName)}`, clusterContext, { method: 'GET' })

export const createAgent = async (payload, clusterContext) =>
  requestBackend('/api/v1/agents', clusterContext, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const updateAgent = async (agentName, payload, clusterContext) =>
  requestBackend(`/api/v1/agents/${encodeURIComponent(agentName)}`, clusterContext, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

export const deleteAgent = async (agentName, clusterContext) =>
  requestBackend(`/api/v1/agents/${encodeURIComponent(agentName)}`, clusterContext, { method: 'DELETE' })

export const runAgent = async (agentName, clusterContext) =>
  requestBackend(`/api/v1/agents/${encodeURIComponent(agentName)}/run`, clusterContext, { method: 'POST' })

export const pauseAgent = async (agentName, clusterContext) =>
  requestBackend(`/api/v1/agents/${encodeURIComponent(agentName)}/pause`, clusterContext, { method: 'POST' })

export const rotateAgentKey = async (agentName, clusterContext) =>
  requestBackend(`/api/v1/agents/${encodeURIComponent(agentName)}/key/rotate`, clusterContext, { method: 'POST' })

export const ensureAIProxyToken = async (clusterContext, payload = {}) =>
  requestBackend('/api/v1/aiproxy/token/ensure', clusterContext, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const buildAgentWebSocketUrl = (agentName) =>
  buildBackendWsUrl(`/api/v1/agents/${encodeURIComponent(agentName)}/ws`)

export const streamAgentChatCompletions = async ({ agentName, payload, onEvent }, clusterContext) => {
  const response = await fetch(
    buildBackendUrl(`/api/v1/agents/${encodeURIComponent(agentName)}/chat/completions`),
    buildAuthorizedRequestOptions(clusterContext, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(payload),
    }),
  )

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || `聊天请求失败: ${response.status}`)
  }

  if (!response.body) {
    throw new Error(`聊天响应为空: ${response.status}`)
  }

  const emit = (event) => {
    onEvent?.(event)
  }

  const contentType = response.headers.get('content-type') || ''
  emit({ type: 'open', transport: 'sse' })

  if (!contentType.includes('text/event-stream')) {
    const data = await response
      .json()
      .catch(async () => ({ choices: [{ message: { content: await response.text().catch(() => '') } }] }))
    emit({ type: 'message', transport: 'sse', payload: data })
    emit({ type: 'done', transport: 'sse' })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''

    for (const chunk of chunks) {
      const lines = chunk.split('\n').filter(Boolean)
      const dataLine = lines.find((line) => line.startsWith('data:'))
      if (!dataLine) continue

      const raw = dataLine.slice(5).trim()
      if (!raw || raw === '[DONE]') {
        emit({ type: 'done', transport: 'sse' })
        continue
      }

      try {
        emit({ type: 'message', transport: 'sse', payload: JSON.parse(raw) })
      } catch {
        emit({ type: 'message', transport: 'sse', payload: { content: raw } })
      }
    }
  }

  emit({ type: 'done', transport: 'sse' })
}
