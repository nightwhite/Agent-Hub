import { Bot } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[320px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-8 py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-400">
        <Bot size={28} />
      </div>
      <h3 className="text-lg font-medium text-zinc-950">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
