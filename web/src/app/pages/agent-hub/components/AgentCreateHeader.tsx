import type { ReactNode } from 'react'

interface AgentCreateHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function AgentCreateHeader({ title, description, actions }: AgentCreateHeaderProps) {
  return (
    <header className="px-6 py-6 lg:px-12">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <div className="truncate text-[28px]/8 font-extrabold tracking-[-0.03em] text-[#151b2d]">{title}</div>
            {description ? (
              <div className="mt-2 max-w-3xl text-sm leading-6 text-[#6d778a]">{description}</div>
            ) : null}
          </div>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </div>
    </header>
  )
}
