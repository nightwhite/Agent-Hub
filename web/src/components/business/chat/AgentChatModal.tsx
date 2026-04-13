import { Send } from 'lucide-react'
import type { ChatSessionState } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'

interface AgentChatModalProps {
  open: boolean
  session: ChatSessionState | null
  onClose: () => void
  onDraftChange: (value: string) => void
  onSend: () => void
}

export function AgentChatModal({
  open,
  session,
  onClose,
  onDraftChange,
  onSend,
}: AgentChatModalProps) {
  return (
    <Modal
      description="部署成功后可以直接在这里验证 Agent 是否正常响应。"
      onClose={onClose}
      open={open}
      title={`对话验证 · ${session?.resource.name || '--'}`}
      widthClassName="max-w-3xl"
    >
      <div className="flex h-[560px] flex-col">
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <div>连接地址: {session?.resource.apiUrl || '当前未读取到 API 地址'}</div>
          <div>状态: {session?.status || '--'}</div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-4">
          {!session?.messages.length ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              发送第一条消息，验证 Agent 对话能力。
            </div>
          ) : (
            session.messages.map((message) => (
              <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`} key={message.id}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'rounded-br-md bg-[var(--color-brand)] text-white'
                      : 'rounded-bl-md border border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))
          )}
        </div>
        {session?.error ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {session.error}
          </div>
        ) : null}
        <div className="mt-4 flex items-end gap-3">
          <textarea
            className="min-h-[92px] flex-1 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--color-brand)] focus:bg-white focus:ring-4 focus:ring-[var(--color-brand)]/10"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="输入测试消息..."
            value={session?.draft || ''}
          />
          <Button disabled={!session?.draft.trim() || session.status === 'connecting'} leading={<Send size={16} />} onClick={onSend}>
            {session?.status === 'connecting' ? '发送中' : '发送'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
