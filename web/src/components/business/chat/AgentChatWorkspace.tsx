import { Bot, Send } from 'lucide-react'
import type { ChatSessionState } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'

interface AgentChatWorkspaceProps {
  session: ChatSessionState | null
  onDraftChange: (value: string) => void
  onSend: () => void
  onOpen?: () => void
  emptyTitle?: string
  emptyDescription?: string
}

export function AgentChatWorkspace({
  session,
  onDraftChange,
  onSend,
  onOpen,
  emptyTitle = '对话',
  emptyDescription = '连接后即可开始会话。',
}: AgentChatWorkspaceProps) {
  if (!session) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Bot size={22} />
        </div>
        <div className="mt-4 text-base font-medium text-slate-950">{emptyTitle}</div>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{emptyDescription}</p>
        {onOpen ? (
          <div className="mt-4">
            <Button onClick={onOpen}>
              <Bot size={16} />
              打开对话
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-slate-950">
            {session.resource.aliasName || session.resource.name}
          </div>
          <div className="mt-1 text-xs text-slate-400">模型: {session.resource.model || '--'}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            状态: {session.status}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            通道: {session.transport}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-4 py-4">
        <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {!session.messages.length ? (
                <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-slate-400">
                发送第一条消息开始会话。
                </div>
            ) : (
              session.messages.map((message) => (
                <div
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  key={message.id}
                >
                  <div
                    className={`max-w-[82%] rounded-xl px-3 py-2.5 text-sm leading-6 ${
                      message.role === 'user'
                        ? 'rounded-br-md bg-[var(--color-brand)] text-white'
                        : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))
            )}
          </div>

          {session.error ? (
            <div className="mx-3 mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {session.error}
            </div>
          ) : null}

          <div className="border-t border-slate-200 px-3 py-3">
            <div className="flex items-end gap-3">
              <textarea
                className="min-h-[84px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand)]/10"
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder="输入测试消息..."
                value={session.draft}
              />
              <Button
                disabled={!session.draft.trim() || session.status === 'connecting'}
                leading={<Send size={16} />}
                onClick={onSend}
              >
                {session.status === 'connecting' ? '发送中' : '发送'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
