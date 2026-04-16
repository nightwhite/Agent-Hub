import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface AgentPageHeaderProps {
  title: string
  description?: string
  backTo: string
  backLabel: string
  badge?: ReactNode
  actions?: ReactNode
}

export function AgentPageHeader({
  title,
  description,
  backTo,
  backLabel,
  badge,
  actions,
}: AgentPageHeaderProps) {
  return (
    <header className="flex min-h-16 w-full flex-shrink-0 items-center justify-between gap-4 border-b border-zinc-200 py-2">
      <div className="min-w-0">
        <Link
          className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 transition hover:text-zinc-900"
          to={backTo}
        >
          <ArrowLeft size={14} />
          {backLabel}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-zinc-950">{title}</h1>
          {badge}
        </div>
        {description ? (
          <p className="mt-1 max-w-3xl text-xs text-zinc-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
