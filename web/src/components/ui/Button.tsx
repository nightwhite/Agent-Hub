import { cn } from '../../lib/format'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { CONTROL_SIZE_CLASSNAME, type ControlSize } from './tokens'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ControlSize
  leading?: ReactNode
}

const variantClassName: Record<ButtonVariant, string> = {
  primary:
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[6px] bg-[var(--color-brand)] font-medium whitespace-nowrap text-white shadow-[0_1px_2px_rgba(24,24,27,0.08)] transition hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[6px] border-[0.5px] border-[var(--color-border)] bg-white font-medium whitespace-nowrap text-[var(--color-text)] shadow-[0_1px_2px_rgba(24,24,27,0.04)] transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50',
  ghost:
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[6px] font-medium whitespace-nowrap text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[6px] bg-[var(--color-danger)] font-medium whitespace-nowrap text-white transition hover:bg-[#dc2626] disabled:cursor-not-allowed disabled:opacity-50',
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  leading,
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(variantClassName[variant], CONTROL_SIZE_CLASSNAME[size], className)} {...props}>
      {leading}
      {children}
    </button>
  )
}
