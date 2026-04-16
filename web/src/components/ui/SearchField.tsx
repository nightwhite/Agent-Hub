import { Search } from 'lucide-react'
import { cn } from '../../lib/format'
import type { InputHTMLAttributes } from 'react'

export function SearchField({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn('relative block', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
      <input className="input h-10 pl-8 text-sm" {...props} />
    </label>
  )
}
