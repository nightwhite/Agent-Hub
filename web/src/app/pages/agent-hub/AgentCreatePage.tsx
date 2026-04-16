import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgentConfigForm } from '../../../components/business/agents/AgentConfigForm'
import { AgentTemplatePickerPanel } from '../../../components/business/agents/AgentTemplatePickerPanel'
import { Button } from '../../../components/ui/Button'
import { AgentCreateSidebar } from './components/AgentCreateSidebar'
import { AgentPageHeader } from './components/AgentPageHeader'
import { AgentHubOverview } from './components/AgentHubOverview'
import { AgentWorkspaceShell } from './components/AgentWorkspaceShell'
import { useAgentHubController } from './hooks/useAgentHubController'
import { applyBlueprintPreset, updateBlueprintField } from './lib/blueprint'
import { DEFAULT_TEMPLATE_ID, EMPTY_BLUEPRINT } from '../../../domains/agents/templates'
import type { AgentBlueprint, AgentTemplateId } from '../../../domains/agents/types'

export function AgentCreatePage() {
  const navigate = useNavigate()
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<AgentTemplateId>(DEFAULT_TEMPLATE_ID)
  const [blueprint, setBlueprint] = useState<AgentBlueprint>({ ...EMPTY_BLUEPRINT })
  const [preparing, setPreparing] = useState(true)

  useEffect(() => {
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
      <AgentPageHeader
        backLabel="返回 Agent 列表"
        backTo="/agents"
        title="创建 Agent"
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3 py-3">
        <AgentHubOverview message={message} />

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
          <AgentCreateSidebar
            blueprint={blueprint}
            templateId={selectedTemplateId}
          />

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
              <div className="text-sm font-medium text-zinc-950">选择模板</div>
              <div className="mt-3">
                <AgentTemplatePickerPanel
                  onSelect={setSelectedTemplateId}
                  selectedTemplateId={selectedTemplateId}
                />
              </div>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                <div>
                  <div className="text-sm font-medium text-zinc-950">配置实例</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => navigate('/agents')} variant="secondary">
                    取消
                  </Button>
                  <Button disabled={submitting || preparing} onClick={handleSubmit}>
                    {submitting ? '部署中...' : '确认部署'}
                  </Button>
                </div>
              </div>

              {loading || preparing ? (
                <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-500">
                  正在准备创建配置...
                </div>
              ) : (
                <div className="mt-4">
                  <AgentConfigForm
                    blueprint={blueprint}
                    mode="create"
                    onChange={handleBlueprintChange}
                    onSelectPreset={handleSelectPreset}
                    templateId={selectedTemplateId}
                    workspaceModelBaseURL={workspaceAIProxyModelBaseURL}
                    workspaceModelKey={workspaceAIProxyToken?.key || ''}
                    workspaceModelKeyReady={Boolean(workspaceAIProxyToken?.key)}
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </AgentWorkspaceShell>
  )
}
