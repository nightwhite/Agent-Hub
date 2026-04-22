import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { APP_NAME } from '../../../../branding'
import { cn } from '../../../../lib/format'

interface AgentWorkspaceShellProps {
  children: ReactNode
  className?: string
  headerActions?: ReactNode
}

type ShellView = 'agents' | 'market' | 'create' | 'detail'

function SparkLogo() {
  return (
    <span className="spark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

function resolveView(pathname: string): ShellView {
  if (pathname === '/agents/templates') return 'market'
  if (pathname === '/agents/create') return 'create'
  if (pathname.startsWith('/agents/')) return 'detail'
  return 'agents'
}

export function AgentWorkspaceShell({
  children,
  className,
  headerActions,
}: AgentWorkspaceShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const view = useMemo(() => resolveView(location.pathname), [location.pathname])

  const breadcrumb = useMemo(() => {
    switch (view) {
      case 'agents':
        return (
          <>
            <b className="text-[#223047]">我的 Agent</b>
            <span>/</span>
            <span>总览</span>
          </>
        )
      case 'market':
        return (
          <>
            <b className="text-[#223047]">Agent 市场</b>
            <span>/</span>
            <span>选择模板</span>
          </>
        )
      case 'create':
        return (
          <>
            <b className="text-[#223047]">创建 Agent</b>
            <span>/</span>
            <span>部署配置</span>
          </>
        )
      default:
        return (
          <>
            <b className="text-[#223047]">Agent 详情</b>
            <span>/</span>
            <span>运行监控</span>
          </>
        )
    }
  }, [view])

  const showCreateStepper = view === 'create'
  const showHeaderSearch = view === 'agents' || view === 'market'
  const headerSearchValue = showHeaderSearch ? String(searchParams.get('q') || '') : ''
  const headerSearchPlaceholder = view === 'market' ? '搜索模板、能力或标签' : '搜索别名或实例名'
  const showBack = view !== 'agents'
  const backTarget = view === 'create' ? '/agents/templates' : '/agents'

  const handleHeaderSearchChange = (value: string) => {
    if (!showHeaderSearch) return
    const next = new URLSearchParams(searchParams)
    if (value.trim()) {
      next.set('q', value)
    } else {
      next.delete('q')
    }
    setSearchParams(next, { replace: true })
  }

  const renderTopActions = () => {
    if (view === 'agents') {
      return (
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            className="inline-flex h-10 items-center justify-center rounded-[11px] border border-[var(--color-border)] bg-white px-4 text-[14px] font-semibold text-[#344055] hover:border-[#d7deea] hover:bg-[#fbfcff]"
            onClick={() => navigate('/agents/templates')}
            type="button"
          >
            浏览模板
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-[11px] border border-[var(--color-brand)] bg-[var(--color-brand)] px-4 text-[14px] font-semibold text-white shadow-[0_10px_20px_rgba(37,99,255,0.18)] hover:bg-[var(--color-brand-hover)]"
            onClick={() => navigate('/agents/templates')}
            type="button"
          >
            ＋ 创建 Agent
          </button>
        </div>
      )
    }

    return null
  }
  const topActions = headerActions ?? renderTopActions()
  const showRightTools = showBack || showHeaderSearch || showCreateStepper || Boolean(topActions)

  return (
    <div className="h-screen overflow-hidden bg-white text-[var(--color-text)]">
      <section
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden bg-white',
          className,
        )}
      >
        <header className="relative z-10 flex min-h-[78px] flex-wrap items-center gap-x-4 gap-y-3 border-b border-[var(--color-border)] bg-[rgba(255,255,255,.96)] px-5 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-xl font-extrabold">
              <SparkLogo />
              <span>{APP_NAME}</span>
            </div>
            <span className="hidden h-6 w-px bg-[var(--color-border)] md:block" />

            <div className="hidden min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-[#697386] md:flex">
              {breadcrumb}
            </div>
          </div>

          {showRightTools ? (
            <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 md:w-auto md:flex-nowrap">
              {showHeaderSearch ? (
                <label className="flex h-10 w-full min-w-[220px] items-center gap-2 overflow-hidden rounded-[11px] border border-[var(--color-border)] bg-white px-3 text-[#667085] sm:w-[280px] lg:w-[360px]">
                  <span className="text-[#98a2b3]">⌕</span>
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-[#1f2937] outline-none"
                    onChange={(event) => handleHeaderSearchChange(event.target.value)}
                    placeholder={headerSearchPlaceholder}
                    type="text"
                    value={headerSearchValue}
                  />
                </label>
              ) : null}

              {showBack ? (
                <button
                  aria-label="返回"
                  className="inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-[20px] leading-none font-semibold text-[#4b5565] hover:text-[var(--color-brand)]"
                  onClick={() => navigate(backTarget)}
                  type="button"
                >
                  ↩
                </button>
              ) : null}

              {showCreateStepper ? (
                <div className="hidden items-center gap-2 text-[13px] font-semibold text-[#8a94a6] xl:flex">
                  <span className="flex items-center gap-1.5">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)] text-white">
                      ✓
                    </span>
                    选择模板
                  </span>
                  <span className="h-px w-16 bg-[#dce2eb]" />
                  <span className="flex items-center gap-1.5 text-[var(--color-brand)]">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)] text-white">
                      2
                    </span>
                    配置资源
                  </span>
                  <span className="h-px w-16 bg-[#dce2eb]" />
                  <span className="flex items-center gap-1.5">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-[#cfd7e5] bg-white text-[#6b7280]">
                      3
                    </span>
                    确认部署
                  </span>
                </div>
              ) : null}

              {topActions}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-white">{children}</div>
      </section>
    </div>
  )
}
