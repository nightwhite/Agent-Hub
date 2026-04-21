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
          // Each page owns its padding; shell only guarantees stable viewport behavior.
          'flex h-[100dvh] min-w-0 flex-col overflow-x-hidden overflow-y-hidden',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
