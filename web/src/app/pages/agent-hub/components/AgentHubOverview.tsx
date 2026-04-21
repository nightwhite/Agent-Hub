import { Info } from 'lucide-react'

interface AgentHubOverviewProps {
  message: string
}

export function AgentHubOverview({ message }: AgentHubOverviewProps) {
  if (!message) return null

  return (
    <div className="flex items-start gap-2 rounded-lg border-[0.5px] border-sky-200 bg-sky-50/80 px-3 py-2 text-[12px]/5 text-sky-950 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-sky-700">
        <Info size={14} />
      </div>
      <div className="min-w-0 flex-1">{message}</div>
    </div>
  )
}
