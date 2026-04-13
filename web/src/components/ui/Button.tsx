import { cn } from '../../lib/format'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  leading?: ReactNode
}

const variantClassName: Record<ButtonVariant, string> = {
  primary:
    'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-brand)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-5 text-sm font-semibold text-[var(--color-text)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
  ghost:
    'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-danger)] px-5 text-sm font-semibold text-white transition hover:bg-[#dc2626] disabled:cursor-not-allowed disabled:opacity-50',
}

export function Button({ className, variant = 'primary', leading, children, ...props }: ButtonProps) {
  return (
    <button className={cn(variantClassName[variant], className)} {...props}>
      {leading}
      {children}
    </button>
  )
}
