import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  widthClassName?: string
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  widthClassName = 'max-w-3xl',
}: ModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className={`flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[28px] border border-white/60 bg-white shadow-[0_32px_96px_rgba(15,23,42,0.18)] ${widthClassName}`}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            {description ? <p className="text-sm text-slate-500">{description}</p> : null}
          </div>
          <button
            aria-label="关闭"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  )
}
