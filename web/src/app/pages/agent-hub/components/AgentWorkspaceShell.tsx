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
    <div className="h-screen bg-[#fafafa] text-[var(--color-text)]">
      <div
        className={cn(
          // DevBox style: each page owns its own padding + min-width strategy.
          // The shell only defines the desktop workbench viewport and horizontal scroll.
          'flex h-full min-w-0 flex-col overflow-x-hidden overflow-y-hidden',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
