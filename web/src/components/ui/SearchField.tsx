import { Search } from 'lucide-react'
import { cn } from '../../lib/format'
import type { InputHTMLAttributes } from 'react'

export function SearchField({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn('relative block', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <input className="input pl-9" {...props} />
    </label>
  )
}
