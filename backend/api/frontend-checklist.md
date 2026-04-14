# Frontend Integration Checklist

给前端联调时直接照这个清单走。

## 1. 启动服务

在 `backend/` 目录执行：

```bash
INGRESS_SUFFIX=agent.usw-1.sealos.app AGENT_IMAGE=nousresearch/hermes-agent:latest go run cmd/app/main.go
```

服务地址：

```text
http://127.0.0.1:8080
```

## 2. 准备 Authorization

除 `healthz` / `readyz` 外，所有业务接口都必须带：

```text
Authorization: <url-encoded kubeconfig>
```

本地生成方式：

```bash
KCFG_ENCODED=$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import quote
print(quote(Path.home().joinpath('.kube/config').read_text()))
PY
)
```

## 3. 先测探针

- `GET /healthz`
- `GET /readyz`

说明：
- `healthz` 只看进程是否活着
- `readyz` 只看静态配置是否完整
- `readyz` 不代表目标 Kubernetes 一定可操作

## 4. 当前可联调的 REST API

- `GET /api/v1/agents`
- `POST /api/v1/agents`
- `GET /api/v1/agents/:agentName`
- `PATCH /api/v1/agents/:agentName`
- `DELETE /api/v1/agents/:agentName`
- `POST /api/v1/agents/:agentName/run`
- `POST /api/v1/agents/:agentName/pause`
- `POST /api/v1/agents/:agentName/key/rotate`

## 5. 当前不要接的接口

- `GET /api/v1/agents/:agentName/key`
  当前固定返回 `501`

## 6. 当前可联调的 WebSocket

- `GET /api/v1/agents/:agentName/ws`
- 支持 terminal、logs、file operations

浏览器联调方式：

- 推荐：
  1. 先连接 WS
  2. 第一条消息发送 `auth`
- 兼容：
  - `/api/v1/agents/:agentName/ws?authorization=<url-encoded-kubeconfig>`

## 7. 返回格式

成功：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {}
}
```

失败：

```json
{
  "code": 42200,
  "message": "agent-model-baseurl is invalid",
  "requestId": "xxx",
  "error": {
    "type": "validation_failed",
    "details": {
      "field": "agent-model-baseurl",
      "reason": "invalid_url",
      "value": "not-a-url"
    }
  },
  "data": null
}
```

前端处理规则：

- `code === 0` 才算成功
- 保留 `requestId`
- 优先读 `error.type`
- `error.details` 只在部分错误场景出现

## 8. Agent 字段里重点关注

- `status`
  常见值：`Running`、`Paused`
- `hasModelAPIKey`
  只表示是否已配置，不返回真实 key
- `apiBaseURL`
  由 ingress 自动派生
- `createdAt`
  当前唯一可靠时间字段

## 9. 建议联调顺序

1. `healthz`
2. `readyz`
3. `GET /agents`
4. `POST /agents`
5. `GET /agents/:agentName`
6. `PATCH /agents/:agentName`
7. `POST /agents/:agentName/pause`
8. `POST /agents/:agentName/run`
9. `POST /agents/:agentName/key/rotate`
10. `DELETE /agents/:agentName`
11. `WS terminal.open`
12. `WS file.write/read/download`
13. `WS file.upload.begin/chunk/end`
14. `WS log.subscribe/unsubscribe`

## 10. 真实联调结论

这套顺序已经用本地 `~/.kube/config` 在真实集群上跑通过。

详细版文档见：

- [frontend-integration.md](/Users/sealos/Agent-Hub/backend/api/frontend-integration.md)
- [frontend-live-examples.md](/Users/sealos/Agent-Hub/backend/api/frontend-live-examples.md)
