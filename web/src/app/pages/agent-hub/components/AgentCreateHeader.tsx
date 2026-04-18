import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../../../lib/format'
import { AGENT_HUB_DIALOG_CONTENT_CLASSNAME } from './workspaceLayout'

interface AgentCreateHeaderProps {
  title: string
  description?: string
  onBack: () => void
  actions?: ReactNode
}

export function AgentCreateHeader({ title, description, onBack, actions }: AgentCreateHeaderProps) {
  return (
    <header className="w-full border-b border-zinc-200/80">
      <div
        className={cn(
          AGENT_HUB_DIALOG_CONTENT_CLASSNAME,
          'flex flex-col gap-3 py-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between',
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <button
            className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            onClick={onBack}
            title="返回"
            type="button"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">创建 Agent</div>
            <div className="mt-1 truncate text-[1.75rem]/[2rem] font-semibold tracking-[-0.04em] text-zinc-950">
              {title}
            </div>
            {description ? (
              <div className="mt-1 max-w-[48ch] text-[13px]/6 text-zinc-500">{description}</div>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center gap-2 min-[900px]:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
