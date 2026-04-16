import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface AgentCreateHeaderProps {
  title: string
  description?: string
  onBack: () => void
  actions?: ReactNode
}

export function AgentCreateHeader({ title, description, onBack, actions }: AgentCreateHeaderProps) {
  return (
    <header className="flex h-24 w-full items-center justify-between self-stretch border-b border-zinc-200 px-10 py-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="flex h-12 w-12 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          onClick={onBack}
          title="返回"
          type="button"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0">
          <div className="truncate text-2xl/8 font-semibold text-zinc-950">{title}</div>
          {description ? (
            <div className="mt-1 truncate text-sm/5 text-zinc-500">{description}</div>
          ) : null}
        </div>
      </div>

      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </header>
  )
}
