import type { ReactNode } from 'react'
import { cn } from '../../../../lib/format'

interface AgentWorkspaceShellProps {
  children: ReactNode
  className?: string
}

export function AgentWorkspaceShell({
  children,
  className,
}: AgentWorkspaceShellProps) {
  return (
    <div className="bg-[var(--color-bg)] text-[var(--color-text)]">
      <div
        className={cn(
          'mx-auto flex h-[calc(100vh-28px)] max-w-[1280px] flex-col px-4',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
