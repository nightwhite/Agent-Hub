import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AgentConfigForm } from '../../../components/business/agents/AgentConfigForm'
import { Button } from '../../../components/ui/Button'
import { AgentCreateSidebar } from './components/AgentCreateSidebar'
import { AgentCreateHeader } from './components/AgentCreateHeader'
import { AgentHubOverview } from './components/AgentHubOverview'
import { AgentWorkspaceShell } from './components/AgentWorkspaceShell'
import { useAgentHubController } from './hooks/useAgentHubController'
import { applyBlueprintPreset, updateBlueprintField } from './lib/blueprint'
import { EMPTY_BLUEPRINT, isAgentTemplateId, resolveTemplateById } from '../../../domains/agents/templates'
import type { AgentBlueprint, AgentTemplateId } from '../../../domains/agents/types'

export function AgentCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const controller = useAgentHubController()
  const {
    clusterContext,
    loading,
    message,
    submitting,
    workspaceAIProxyModelBaseURL,
    workspaceAIProxyToken,
    prepareCreateBlueprint,
    createAgentFromBlueprint,
    setMessage,
  } = controller
  const [blueprint, setBlueprint] = useState<AgentBlueprint>({ ...EMPTY_BLUEPRINT })
  const [preparing, setPreparing] = useState(true)
  const selectedTemplateId = useMemo<AgentTemplateId | null>(() => {
    const template = searchParams.get('template') || ''
    return isAgentTemplateId(template) ? template : null
  }, [searchParams])

  const selectedTemplate = selectedTemplateId ? resolveTemplateById(selectedTemplateId) : null

  useEffect(() => {
    if (!selectedTemplateId) {
      navigate('/agents/templates', { replace: true })
    }
  }, [navigate, selectedTemplateId])

  useEffect(() => {
    if (!selectedTemplateId) return

    if (!clusterContext) {
      if (!loading) {
        setPreparing(false)
      }
      return
    }

    let disposed = false
    setPreparing(true)

    void prepareCreateBlueprint(selectedTemplateId)
      .then((nextBlueprint) => {
        if (disposed) return
        setBlueprint(nextBlueprint)
      })
      .catch((error) => {
        if (disposed) return
        setMessage(error instanceof Error ? error.message : '加载创建模板失败')
      })
      .finally(() => {
        if (disposed) return
        setPreparing(false)
      })

    return () => {
      disposed = true
    }
  }, [clusterContext, loading, prepareCreateBlueprint, selectedTemplateId, setMessage])

  const handleBlueprintChange = (field: keyof AgentBlueprint, value: string) => {
    setBlueprint((current) => updateBlueprintField(current, field, value))
  }

  const handleSelectPreset = (presetId: AgentBlueprint['profile']) => {
    setBlueprint((current) => applyBlueprintPreset(current, presetId))
  }

  const handleSubmit = async () => {
    try {
      const result = await createAgentFromBlueprint(blueprint)
      navigate(`/agents/${result.agentName}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交失败')
    }
  }

  return (
    <AgentWorkspaceShell>
      <div className="flex h-full min-w-[1024px] flex-col items-center">
        <AgentCreateHeader
          description={
            selectedTemplate
              ? `按 ${selectedTemplate.name} 模板创建 Agent 实例，并在部署时自动接入工作区 AIProxy。`
              : undefined
          }
          onBack={() => navigate('/agents/templates')}
          title={selectedTemplate ? `创建 ${selectedTemplate.shortName}` : '创建 Agent'}
          actions={(
            <>
              <Button onClick={() => navigate('/agents/templates')} variant="secondary">
                更换模板
              </Button>
              <Button onClick={() => navigate('/agents')} variant="secondary">
                取消
              </Button>
              <Button disabled={submitting || preparing} onClick={handleSubmit}>
                {submitting ? '部署中...' : '确认部署'}
              </Button>
            </>
          )}
        />

        <main className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden px-10 pt-6">
          <AgentHubOverview message={message} />

          <div className="min-h-0 flex-1 overflow-y-auto pb-6">
            <div className="flex min-h-full w-full min-w-[1040px] items-start gap-6">
              {selectedTemplateId ? (
                <AgentCreateSidebar blueprint={blueprint} templateId={selectedTemplateId} />
              ) : null}

              <section className="min-w-[720px] flex-1">
                {loading || preparing ? (
                  <div className="flex min-h-[560px] items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-500 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
                    正在准备创建配置...
                  </div>
                ) : (
                  <AgentConfigForm
                    blueprint={blueprint}
                    mode="create"
                    onChange={handleBlueprintChange}
                    onSelectPreset={handleSelectPreset}
                    templateId={selectedTemplateId || 'hermes-agent'}
                    workspaceModelBaseURL={workspaceAIProxyModelBaseURL}
                    workspaceModelKey={workspaceAIProxyToken?.key || ''}
                    workspaceModelKeyReady={Boolean(workspaceAIProxyToken?.key)}
                  />
                )}
              </section>
            </div>
          </div>
        </main>
      </div>
    </AgentWorkspaceShell>
  )
}
