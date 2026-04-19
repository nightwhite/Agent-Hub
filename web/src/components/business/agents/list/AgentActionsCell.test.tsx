import { fireEvent, render, screen, within } from '@testing-library/react'
import { AgentActionsCell } from './AgentActionsCell'
import { createAgentItemFixture, createTemplateFixture } from '../../../../test/agentFixtures'

describe('AgentActionsCell', () => {
  const noop = () => {}

  it('shows Hermes action set without unrelated web ui entry', () => {
    const item = createAgentItemFixture({
      template: createTemplateFixture(),
      access: [
        { key: 'api', label: 'API', enabled: true, url: 'https://demo.example.com/v1' },
        { key: 'terminal', label: '终端', enabled: true },
        { key: 'files', label: '文件', enabled: true, rootPath: '/opt/hermes' },
      ],
      actions: [
        { key: 'open-chat', label: '对话', enabled: true },
        { key: 'open-terminal', label: '终端', enabled: true },
        { key: 'open-files', label: '文件', enabled: true },
        { key: 'open-settings', label: '配置', enabled: true },
        { key: 'delete', label: '删除', enabled: true },
      ],
    })

    render(
      <AgentActionsCell
        item={item}
        onChat={noop}
        onDelete={noop}
        onEdit={noop}
        onFiles={noop}
        onOpenDetail={noop}
        onTerminal={noop}
        onToggleState={noop}
        onWebUI={noop}
      />,
    )

    fireEvent.click(screen.getByTitle('更多操作'))
    const deleteButton = screen.getByRole('button', { name: '删除' })
    const menu = deleteButton.parentElement as HTMLElement

    expect(within(menu).getByRole('button', { name: '对话' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: '终端' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: '文件' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: '配置' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: '删除' })).toBeInTheDocument()
    expect(within(menu).queryByRole('button', { name: 'Web UI' })).not.toBeInTheDocument()
  })

  it('shows OpenClaw action set with web ui but without chat', () => {
    const item = createAgentItemFixture({
      templateId: 'openclaw',
      template: createTemplateFixture({ id: 'openclaw', name: 'OpenClaw', workingDir: '/app', user: 'openclaw' }),
      access: [
        { key: 'web-ui', label: 'Web UI', enabled: true, url: 'https://openclaw.example.com/' },
        { key: 'terminal', label: '终端', enabled: true },
        { key: 'files', label: '文件', enabled: true, rootPath: '/app' },
      ],
      actions: [
        { key: 'open-terminal', label: '终端', enabled: true },
        { key: 'open-files', label: '文件', enabled: true },
        { key: 'open-settings', label: '配置', enabled: true },
        { key: 'delete', label: '删除', enabled: true },
      ],
    })

    render(
      <AgentActionsCell
        item={item}
        onChat={noop}
        onDelete={noop}
        onEdit={noop}
        onFiles={noop}
        onOpenDetail={noop}
        onTerminal={noop}
        onToggleState={noop}
        onWebUI={noop}
      />,
    )

    fireEvent.click(screen.getByTitle('更多操作'))
    const deleteButton = screen.getByRole('button', { name: '删除' })
    const menu = deleteButton.parentElement as HTMLElement

    expect(within(menu).getByRole('button', { name: 'Web UI' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: '终端' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: '文件' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: '配置' })).toBeInTheDocument()
    expect(within(menu).queryByRole('button', { name: '对话' })).not.toBeInTheDocument()
  })
})
