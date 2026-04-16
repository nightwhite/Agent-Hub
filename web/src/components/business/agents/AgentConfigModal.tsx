import { resolveTemplateById } from '../../../domains/agents/templates'
import type { AgentBlueprint, AgentTemplateId } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { AgentConfigForm } from './AgentConfigForm'

interface AgentConfigModalProps {
  open: boolean
  mode: 'create' | 'edit'
  templateId: AgentTemplateId
  blueprint: AgentBlueprint
  workspaceModelBaseURL: string
  workspaceModelKey: string
  workspaceModelKeyReady: boolean
  submitting: boolean
  onClose: () => void
  onChange: (field: keyof AgentBlueprint, value: string) => void
  onSelectPreset: (presetId: AgentBlueprint['profile']) => void
  onSubmit: () => void
}

export function AgentConfigModal({
  open,
  mode,
  templateId,
  blueprint,
  workspaceModelBaseURL,
  workspaceModelKey,
  workspaceModelKeyReady,
  submitting,
  onClose,
  onChange,
  onSelectPreset,
  onSubmit,
}: AgentConfigModalProps) {
  const template = resolveTemplateById(templateId)

  return (
    <Modal
      description={
        mode === 'create'
          ? '前端现在直接对接统一后端 API，由后端完成 DevBox / Service / Ingress 编排。'
          : `正在编辑 ${blueprint.aliasName || blueprint.appName} 的资源规格。`
      }
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            取消
          </Button>
          <Button disabled={submitting} onClick={onSubmit}>
            {submitting ? '部署中...' : mode === 'create' ? '确认部署' : '保存配置'}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={`配置 ${template.name}`}
      widthClassName="max-w-4xl"
    >
      <AgentConfigForm
        blueprint={blueprint}
        mode={mode}
        onChange={onChange}
        onSelectPreset={onSelectPreset}
        templateId={templateId}
        workspaceModelBaseURL={workspaceModelBaseURL}
        workspaceModelKey={workspaceModelKey}
        workspaceModelKeyReady={workspaceModelKeyReady}
      />
    </Modal>
  )
}
