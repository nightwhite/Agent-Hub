import { describe, expect, it } from 'vitest'
import { __agentFilesTestables } from './useAgentFiles'

describe('useAgentFiles helpers', () => {
  it('creates ready gate that resolves only once', async () => {
    const gate = __agentFilesTestables.createReadyGate()

    gate.resolve()
    gate.reject(new Error('ignored after resolve'))

    await expect(gate.promise).resolves.toBeUndefined()
    expect(gate.settled).toBe(true)
  })

  it('creates ready gate that rejects when unresolved', async () => {
    const gate = __agentFilesTestables.createReadyGate()
    const expected = new Error('connection failed')

    gate.reject(expected)
    gate.resolve()

    await expect(gate.promise).rejects.toThrow('connection failed')
    expect(gate.settled).toBe(true)
  })

  it('exposes reconnect policy for retry backoff', () => {
    expect(__agentFilesTestables.reconnectDelaySchedule.length).toBeGreaterThan(0)
    expect(__agentFilesTestables.maxReconnectAttempts).toBeGreaterThanOrEqual(
      __agentFilesTestables.reconnectDelaySchedule.length,
    )
  })
})
