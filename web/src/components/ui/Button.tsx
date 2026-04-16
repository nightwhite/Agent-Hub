import { cn } from '../../lib/format'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  leading?: ReactNode
}

const variantClassName: Record<ButtonVariant, string> = {
  primary:
    'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand)] px-3.5 text-sm font-medium text-white transition hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'inline-flex h-10 items-center justify-center gap-2 rounded-lg border-[0.5px] border-[var(--color-border)] bg-white px-3.5 text-sm font-medium text-[var(--color-text)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50',
  ghost:
    'inline-flex h-10 items-center justify-center gap-2 rounded-md px-2.5 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--color-danger)] px-3.5 text-sm font-medium text-white transition hover:bg-[#dc2626] disabled:cursor-not-allowed disabled:opacity-50',
}

export function Button({ className, variant = 'primary', leading, children, ...props }: ButtonProps) {
  return (
    <button className={cn(variantClassName[variant], className)} {...props}>
      {leading}
      {children}
    </button>
  )
}
