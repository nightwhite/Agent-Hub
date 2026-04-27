# 变更提案: 外部模板 Git 源接入

## 需求背景
当前 Agent Hub 后端只读取仓库内置 `template/<id>/template.yaml`，实际后续镜像与 Agent 元数据已经迁移到独立模板仓库 `Agent-Hub-Template`。如果继续依赖内置模板，Agent 列表、部署镜像与后续配置契约会和真实镜像发布源脱节。

## 变更内容
1. 新增后端环境变量，用于配置外部 Agent 模板 Git 地址。
2. 后端在该变量存在时，从模板仓库读取 `registry/agents.yaml` 与每个 Agent 的 `index.json` / `deploy.yaml` / `config.json` / `config.sh`。
3. 将外部仓库的 Agent 元数据适配为现有 `Template Catalog` 定义，部署时使用外部模板中的镜像信息。
4. 保留当前 Devbox/Service/Ingress 部署模型，不直接 apply 外部任意 Deployment YAML。

## 影响范围
- **模块:** backend config, agenttemplate, handler, docs
- **文件:** `backend/internal/config`, `backend/internal/agenttemplate`, `backend/internal/handler`, `backend/README.md`, `helloagents/wiki/*`
- **API:** `GET /api/v1/templates` 响应仍保持现有 DTO，数据源可切换为外部模板仓库
- **数据:** 无持久化数据结构变更

## 核心场景

### 需求: 外部模板列表
**模块:** backend/internal/agenttemplate
当配置了模板 Git 地址时，后端应从外部仓库 registry 获取启用的 Agent，并返回给 `/api/v1/templates`。

#### 场景: 使用外部镜像
- 环境变量指向一个包含 `registry/agents.yaml` 和 `agents/<id>/index.json` 的仓库
- `GET /api/v1/templates` 返回的 `image` 来自外部 `index.json` 或 `deploy.yaml`

### 需求: 部署使用外部镜像
**模块:** backend/internal/handler
创建 Agent 时，应通过同一外部模板源解析模板定义，并将外部镜像传给现有 Kubernetes 资源构造逻辑。

#### 场景: 创建 Hermes Agent
- `template-id=hermes-agent`
- 外部模板 `image=agent-hub/hermes-agent:dev`
- 后端构造 Devbox 时使用该镜像，而不是内置 `nousresearch/hermes-agent:latest`

## 风险评估
- **风险:** 直接执行外部 `deploy.yaml` 会绕开当前 Devbox 管理、状态转换、SSH/文件/终端能力契约。
- **缓解:** 本轮只把外部仓库作为元数据、镜像与配置契约源，仍复用现有 Devbox 部署模型。
- **风险:** Git 拉取可能带来请求级延迟和网络失败。
- **缓解:** 使用本地缓存目录，按 TTL 刷新；测试使用本地 fixture，不依赖网络。
