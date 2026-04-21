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
    <header className="bg-[#fafafa] px-6 py-8 lg:px-12 lg:py-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-4">
          <button
            className="flex w-fit cursor-pointer items-center gap-2 text-zinc-500 transition hover:text-zinc-950"
            onClick={onBack}
            title="返回"
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">返回模板市场</span>
          </button>

          <div className="min-w-0">
            <div className="truncate text-[24px]/8 font-semibold tracking-[-0.02em] text-[#0a0a0a]">
              {title}
            </div>
            {description ? (
              <div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">{description}</div>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
