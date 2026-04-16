import { Info } from 'lucide-react'

interface AgentHubOverviewProps {
  message: string
}

export function AgentHubOverview({ message }: AgentHubOverviewProps) {
  if (!message) return null

  return (
    <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
      <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sky-700">
        <Info size={14} />
      </div>
      <div className="min-w-0 flex-1 leading-6">{message}</div>
    </div>
  )
}
