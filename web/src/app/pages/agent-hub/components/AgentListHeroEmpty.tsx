import { cn } from '../../../../lib/format'
import { Button } from '../../../../components/ui/Button'

type AgentListHeroEmptyMode = 'create' | 'search'

interface AgentListHeroEmptyProps {
  mode: AgentListHeroEmptyMode
  onAction?: () => void
}

const emptyCopy: Record<
  AgentListHeroEmptyMode,
  {
    title: string
    description: string
    actionLabel: string
    image: string
  }
> = {
  create: {
    title: '还没有 Agent',
    description: '从模板中创建实例后，这里会显示运行状态和操作入口。',
    actionLabel: '创建 Agent',
    image: '/images/list-empty.svg',
  },
  search: {
    title: '未找到匹配结果',
    description: '调整关键词，或清空筛选后重试。',
    actionLabel: '清空搜索',
    image: '/images/search-empty.svg',
  },
}

export function AgentListHeroEmpty({ mode, onAction }: AgentListHeroEmptyProps) {
  const content = emptyCopy[mode]
  const interactive = Boolean(onAction)

  const panelClassName = cn(
    'relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10',
    interactive
      ? 'cursor-pointer transition-colors hover:border-zinc-400 hover:bg-zinc-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200'
      : '',
  )

  const panelContent = (
    <>
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto w-[900px] max-w-none opacity-90"
        src={content.image}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.9)_0%,rgba(255,255,255,0.42)_48%,rgba(255,255,255,0.92)_100%)]" />
      <div className="relative z-10 flex w-full max-w-[320px] -translate-y-4 flex-col items-center gap-1 text-center">
        <div className="text-[1.35rem]/8 font-medium tracking-[-0.02em] text-zinc-950">{content.title}</div>
        <p className="text-[13px]/6 text-zinc-500">{content.description}</p>
        {interactive ? (
          <Button
            className="pointer-events-none mt-3 border-zinc-200 bg-white text-zinc-700 shadow-none"
            size="sm"
            type="button"
            variant="secondary"
          >
            {content.actionLabel}
          </Button>
        ) : null}
      </div>
    </>
  )

  if (!interactive) {
    return <div className={panelClassName}>{panelContent}</div>
  }

  return (
    <button className={panelClassName} onClick={onAction} type="button">
      {panelContent}
    </button>
  )
}
