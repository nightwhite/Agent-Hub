export const formatCpu = (value = '') => {
  const normalized = String(value || '').trim()
  if (!normalized) return '--'
  if (normalized.endsWith('m')) {
    const numeric = Number(normalized.replace(/m$/, ''))
    if (Number.isFinite(numeric)) {
      return `${numeric / 1000} C`
    }
  }
  return normalized
}

export const formatMemory = (value = '') => {
  const normalized = String(value || '').trim()
  if (!normalized) return '--'
  if (normalized.endsWith('Mi')) {
    const numeric = Number(normalized.replace(/Mi$/, ''))
    if (Number.isFinite(numeric)) {
      return `${Math.round((numeric / 1024) * 10) / 10} G`
    }
  }
  if (normalized.endsWith('Gi')) {
    return normalized.replace(/Gi$/, ' G')
  }
  return normalized
}

export const formatStorage = (value = '') => {
  const normalized = String(value || '').trim()
  if (!normalized) return '--'
  if (normalized.endsWith('Gi')) {
    return normalized.replace(/Gi$/, ' GiB')
  }
  return normalized
}

export const formatTime = (value = '') => value || '--'

export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')
