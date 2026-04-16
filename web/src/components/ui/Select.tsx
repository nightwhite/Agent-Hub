import { cn } from '../../lib/format'
import type { SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
}

export function Select({ label, hint, error, className, children, ...props }: SelectProps) {
  return (
    <label className="block space-y-2">
      {label ? <span className="text-sm font-medium text-slate-900">{label}</span> : null}
      <select
        className={cn(
          'field-input',
          error ? 'border-rose-300 bg-rose-50/60 focus:border-rose-500 focus:ring-rose-500/10' : '',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      {!error && hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}
