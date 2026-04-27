# 任务清单: 外部模板 Git 源接入

目录: `helloagents/history/2026-04/202604270024_external_template_git_source/`

---

## 1. 配置与数据源
- [√] 1.1 在 `backend/internal/config/config.go` 中新增模板 Git URL 与缓存目录配置，验证环境变量可读取。
- [√] 1.2 在 `backend/internal/agenttemplate` 中新增外部仓库 source options、缓存与 registry/index/deploy 解析，验证外部 fixture 可转成 `Definition`。

## 2. 后端链路接入
- [√] 2.1 在模板列表 handler 中切到统一 source options，验证 `/api/v1/templates` 可返回外部镜像。
- [√] 2.2 在模板 resolve 缓存与创建链路中纳入外部 Git URL，验证部署镜像来自外部定义。
- [√] 2.3 将 GitHub 源中的 `agent-hub/<name>:<tag>` 占位镜像映射到 GHCR，并验证真实 `hermes-agent/openclaw` 镜像可解析。
- [√] 2.4 补齐外部 `config.json/config.sh` 的模型与 gateway bootstrap 桥接，验证模型切换会触发 rebootstrap。

## 3. 安全检查
- [√] 3.1 执行安全检查：不从用户输入读取 Git URL、不执行外部脚本、不泄露配置内容。
- [√] 3.2 控制台路径策略改为默认 `/workspace` 但允许容器绝对路径，文件 UI 补齐下载/删除入口且删除需确认。

## 4. 文档更新
- [√] 4.1 更新 `backend/README.md`、`helloagents/wiki/arch.md`、`helloagents/wiki/api.md`、`helloagents/wiki/data.md` 与 `helloagents/CHANGELOG.md`。

## 5. 测试
- [√] 5.1 运行 `cd backend && go test ./...`，验证后端测试通过。
