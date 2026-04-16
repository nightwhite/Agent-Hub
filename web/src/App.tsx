import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AgentCreatePage } from './app/pages/agent-hub/AgentCreatePage'
import { AgentDetailPage } from './app/pages/agent-hub/AgentDetailPage'
import { AgentsListPage } from './app/pages/agent-hub/AgentsListPage'
import { AgentHubDesktopBridge } from './app/pages/agent-hub/components/AgentHubDesktopBridge'
import { AgentTerminalWindowPage } from './app/pages/agent-hub/AgentTerminalWindowPage'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AgentHubDesktopBridge />
      <Routes>
        <Route element={<Navigate replace to="/agents" />} path="/" />
        <Route element={<AgentsListPage />} path="/agents" />
        <Route element={<AgentCreatePage />} path="/agents/create" />
        <Route element={<AgentDetailPage />} path="/agents/:agentName" />
        <Route element={<AgentTerminalWindowPage />} path="/desktop/terminal" />
        <Route element={<Navigate replace to="/agents" />} path="*" />
      </Routes>
    </BrowserRouter>
  )
}
