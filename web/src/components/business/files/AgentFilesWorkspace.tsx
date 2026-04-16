import { ChevronUp, Download, File, FilePlus2, FileText, Folder, FolderPlus, RefreshCw, Save, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef } from 'react'
import type { ChangeEvent } from 'react'
import type { AgentFileItem, FilesSessionState } from '../../../domains/agents/types'
import { cn } from '../../../lib/format'
import { Button } from '../../ui/Button'

interface AgentFilesWorkspaceProps {
  session: FilesSessionState | null
  onOpen?: () => void
  onOpenEntry: (item: AgentFileItem) => void
  onOpenParent: () => void
  onRefresh: () => void
  onChangeContent: (value: string) => void
  onSave: () => void
  onDownload: (path: string) => void
  onDelete: (path: string) => void
  onCreateDirectory: (name: string) => void
  onCreateFile: (name: string) => void
  onUpload: (files: FileList | File[]) => void
}

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return '--'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round((size / 1024) * 10) / 10} KB`
  return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`
}

export function AgentFilesWorkspace({
  session,
  onOpen,
  onOpenEntry,
  onOpenParent,
  onRefresh,
  onChangeContent,
  onSave,
  onDownload,
  onDelete,
  onCreateDirectory,
  onCreateFile,
  onUpload,
}: AgentFilesWorkspaceProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const selectedFileName = useMemo(
    () => session?.selectedPath.split('/').filter(Boolean).pop() || '',
    [session?.selectedPath],
  )

  const canGoUp = Boolean(session && session.currentPath !== session.rootPath)
  const canSave = session?.selectedType === 'file' && session.dirty
  const canDownload = session?.selectedType === 'file' && Boolean(session.selectedPath)
  const canDelete = Boolean(session?.selectedPath)

  const handleCreateFile = () => {
    const name = window.prompt('输入新文件名，例如 `README.md`')
    if (!name?.trim()) return
    onCreateFile(name)
  }

  const handleCreateDirectory = () => {
    const name = window.prompt('输入新目录名')
    if (!name?.trim()) return
    onCreateDirectory(name)
  }

  const handleDelete = () => {
    if (!session?.selectedPath) return
    const confirmed = window.confirm(`确定删除 ${session.selectedPath} 吗？`)
    if (!confirmed) return
    onDelete(session.selectedPath)
  }

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files?.length) {
      onUpload(files)
    }
    event.target.value = ''
  }

  const renderItemIcon = (item: AgentFileItem) => {
    if (item.type === 'dir') return <Folder size={16} className="text-sky-600" />
    if (item.type === 'file') return <FileText size={16} className="text-slate-500" />
    return <File size={16} className="text-slate-400" />
  }

  if (!session) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Folder size={22} />
        </div>
        <div className="mt-4 text-base font-medium text-slate-950">文件工作台</div>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
          连接后会读取 Agent 安装目录，你可以直接浏览、编辑、上传和下载文件。
        </p>
        {onOpen ? (
          <div className="mt-4">
            <Button onClick={onOpen} variant="secondary">
              <Folder size={16} />
              打开文件工作台
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[500px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
          状态: {session.status}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
          根目录: {session.rootPath}
        </span>
        {session.podName ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            Pod: {session.podName}
          </span>
        ) : null}
      </div>

      {session.error ? (
        <div className="px-4 pt-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {session.error}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">当前目录</div>
            <div className="mt-1 truncate font-mono text-sm text-slate-900">{session.currentPath}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!canGoUp} onClick={onOpenParent} type="button" variant="ghost">
              <ChevronUp size={16} />
              上级
            </Button>
            <Button onClick={onRefresh} type="button" variant="ghost">
              <RefreshCw size={16} />
              刷新
            </Button>
            <Button onClick={() => uploadInputRef.current?.click()} type="button" variant="ghost">
              <Upload size={16} />
              上传
            </Button>
            <Button onClick={handleCreateFile} type="button" variant="ghost">
              <FilePlus2 size={16} />
              新建文件
            </Button>
            <Button onClick={handleCreateDirectory} type="button" variant="ghost">
              <FolderPlus size={16} />
              新建目录
            </Button>
            <Button
              disabled={!canDownload}
              onClick={() => session.selectedPath && onDownload(session.selectedPath)}
              type="button"
              variant="ghost"
            >
              <Download size={16} />
              下载
            </Button>
            <Button disabled={!canSave} onClick={onSave} type="button" variant="ghost">
              <Save size={16} />
              保存
            </Button>
            <Button
              className="hover:bg-rose-50 hover:text-rose-600"
              disabled={!canDelete}
              onClick={handleDelete}
              type="button"
              variant="ghost"
            >
              <Trash2 size={16} />
              删除
            </Button>
          </div>
          <input className="hidden" multiple onChange={handleUploadChange} ref={uploadInputRef} type="file" />
        </div>

        <div className="mt-3 grid min-h-[400px] gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-3 py-2.5 text-sm font-medium text-slate-950">目录</div>
            <div className="h-[360px] overflow-y-auto p-2">
              {!session.items.length ? (
                <div className="flex h-full items-center justify-center px-4 text-sm text-slate-400">
                  当前目录没有文件。
                </div>
              ) : (
                <div className="space-y-1">
                  {session.items.map((item) => {
                    const active = session.selectedPath === item.path
                    return (
                      <button
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left transition',
                          active ? 'bg-slate-900 text-white' : 'hover:bg-slate-50',
                        )}
                        key={item.path}
                        onClick={() => onOpenEntry(item)}
                        type="button"
                      >
                        <div className={cn('shrink-0', active ? 'text-white' : '')}>{renderItemIcon(item)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{item.name}</div>
                          <div className={cn('mt-1 text-xs', active ? 'text-white/70' : 'text-slate-400')}>
                            {item.type === 'dir' ? '目录' : formatFileSize(item.size)}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-950">
                  {selectedFileName || '未选择文件'}
                </div>
                <div className="mt-1 truncate text-xs text-slate-400">
                  {session.selectedPath || '从左侧选择一个文件开始查看或编辑'}
                </div>
              </div>
              {session.dirty ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  未保存
                </span>
              ) : null}
            </div>

            {!session.selectedPath ? (
              <div className="flex h-[360px] items-center justify-center px-6 text-sm text-slate-400">
                选择一个文件以查看内容，或者新建文件后开始编辑。
              </div>
            ) : session.selectedType !== 'file' ? (
              <div className="flex h-[360px] items-center justify-center px-6 text-sm text-slate-400">
                当前选择的是目录。请从左侧选择具体文件。
              </div>
            ) : (
              <div className="h-[360px] p-3">
                <textarea
                  className="h-full w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-sm leading-6 text-slate-900 outline-none transition focus:border-[var(--color-brand)] focus:bg-white focus:ring-4 focus:ring-[var(--color-brand)]/10"
                  onChange={(event) => onChangeContent(event.target.value)}
                  placeholder="文件内容为空"
                  spellCheck={false}
                  value={session.selectedContent}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
