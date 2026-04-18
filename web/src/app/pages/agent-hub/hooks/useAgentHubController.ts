import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAgent,
  createClusterContext,
  deleteAgent,
  ensureAIProxyToken,
  getClusterInfo,
  getCreateBlueprint,
  getSystemConfig,
  listAgentTemplates,
  listAgents,
  pauseAgent,
  runAgent,
  updateAgentRuntime,
  updateAgentSettings,
} from "../../../../api";
import {
  createBlueprintFromAgentItem,
  ensureDns1035Name,
  mapBackendAgentsToListItems,
} from "../../../../domains/agents/mappers";
import {
  getRequiredTemplateSettingError,
  readBlueprintSettingValue,
} from "../../../../domains/agents/blueprintFields";
import {
  createEmptyBlueprint,
  findTemplateById,
  getDefaultModelOption,
  hydrateTemplateCatalog,
  indexTemplatesById,
} from "../../../../domains/agents/templates";
import type {
  AgentBlueprint,
  AgentContract,
  AgentHubRegion,
  AgentListItem,
  AgentTemplateDefinition,
  ClusterContext,
  ClusterInfo,
  SystemConfig,
  WorkspaceAIProxyToken,
} from "../../../../domains/agents/types";
import { getSealosSession } from "../../../../sealosSdk";

const WORKSPACE_AIPROXY_TOKEN_NAME = "Agent-Hub";
const WORKSPACE_TOKEN_RETRY_COOLDOWN_MS = 30_000;

type LoadedSnapshot = {
  clusterContext: ClusterContext;
  clusterInfo: ClusterInfo;
  templates: AgentTemplateDefinition[];
  items: AgentListItem[];
  systemConfig: SystemConfig;
};

const toWorkspaceAIProxyToken = (
  payload: unknown,
): WorkspaceAIProxyToken | null => {
  const source = payload as {
    token?: { id?: number; name?: string; key?: string; status?: number };
    existed?: boolean;
  };
  if (!source?.token) {
    return null;
  }

  return {
    id: Number(source.token.id || 0),
    name: String(source.token.name || ""),
    key: String(source.token.key || ""),
    status: Number(source.token.status || 0),
    existed: Boolean(source.existed),
  };
};

export function useAgentHubController() {
  const [items, setItems] = useState<AgentListItem[]>([]);
  const [templates, setTemplates] = useState<AgentTemplateDefinition[]>([]);
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null);
  const [clusterContext, setClusterContext] = useState<ClusterContext | null>(
    null,
  );
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [workspaceAIProxyToken, setWorkspaceAIProxyToken] =
    useState<WorkspaceAIProxyToken | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const workspaceTokenPromiseRef =
    useRef<Promise<WorkspaceAIProxyToken | null> | null>(null);
  const workspaceTokenFailureAtRef = useRef(0);

  const templatesById = useMemo(
    () => indexTemplatesById(templates),
    [templates],
  );
  const workspaceRegion: AgentHubRegion = systemConfig?.region || "us";
  const workspaceAIProxyModelBaseURL = systemConfig?.aiProxyModelBaseURL || "";

  const getAgentLabel = useCallback((aliasName: string, agentName: string) => {
    const displayName = aliasName.trim();
    if (!displayName || displayName === agentName) {
      return agentName;
    }
    return `${displayName} (${agentName})`;
  }, []);

  const resolveClusterContext = useCallback(async () => {
    if (
      clusterContext?.kubeconfig &&
      clusterContext.namespace &&
      clusterContext.server
    ) {
      return clusterContext;
    }

    try {
      return createClusterContext(null);
    } catch {
      const session = await getSealosSession().catch(() => null);
      return createClusterContext(session);
    }
  }, [clusterContext]);

  const ensureWorkspaceTokenReady = useCallback(
    async (context: ClusterContext) => {
      if (workspaceAIProxyToken?.key) {
        return workspaceAIProxyToken;
      }

      if (workspaceTokenPromiseRef.current) {
        const token = await workspaceTokenPromiseRef.current;
        if (token?.key) {
          setWorkspaceAIProxyToken(token);
        }
        return token;
      }

      if (
        workspaceTokenFailureAtRef.current &&
        Date.now() - workspaceTokenFailureAtRef.current <
          WORKSPACE_TOKEN_RETRY_COOLDOWN_MS
      ) {
        return null;
      }

      workspaceTokenPromiseRef.current = ensureAIProxyToken(context, {
        name: WORKSPACE_AIPROXY_TOKEN_NAME,
      })
        .then((payload) => toWorkspaceAIProxyToken(payload))
        .catch((error) => {
          workspaceTokenFailureAtRef.current = Date.now();
          const detail = (() => {
            const payload = (error as { payload?: unknown })?.payload as
              | { error?: { details?: { upstreamMessage?: string; reason?: string } }; message?: string }
              | undefined;
            return (
              payload?.error?.details?.upstreamMessage ||
              payload?.error?.details?.reason ||
              payload?.message ||
              ""
            );
          })();
          const message =
            error instanceof Error ? error.message : String(error || "");
          const nextMessage = detail ? `${message}（${detail}）` : message;
          setMessage(nextMessage || "读取 AI-Proxy 密钥失败");
          console.warn("[aiproxy] ensure workspace token failed", {
            message,
            detail,
            payload: (error as { payload?: unknown })?.payload,
          });
          return null;
        })
        .finally(() => {
          workspaceTokenPromiseRef.current = null;
        });

      const token = await workspaceTokenPromiseRef.current;
      if (token?.key) {
        setWorkspaceAIProxyToken(token);
      }
      return token;
    },
    [workspaceAIProxyToken],
  );

  const loadAll = useCallback(
    async ({
      ensureWorkspaceToken = false,
    }: {
      ensureWorkspaceToken?: boolean;
    } = {}): Promise<LoadedSnapshot | null> => {
      setLoading(true);

      try {
        const nextClusterContext = await resolveClusterContext();
        const [
          nextClusterInfo,
          templatePayload,
          nextSystemConfig,
          agentsPayload,
        ] = await Promise.all([
          getClusterInfo(nextClusterContext),
          listAgentTemplates(),
          getSystemConfig(),
          listAgents(nextClusterContext),
        ]);

        const nextTemplates = hydrateTemplateCatalog(templatePayload.items);
        const nextItems = mapBackendAgentsToListItems(
          agentsPayload?.items || [],
          nextTemplates,
          nextClusterInfo,
        );

        setClusterContext(nextClusterContext);
        setClusterInfo(nextClusterInfo);
        setTemplates(nextTemplates);
        setItems(nextItems);
        setSystemConfig(nextSystemConfig);
        setMessage("");

        if (ensureWorkspaceToken) {
          void ensureWorkspaceTokenReady(nextClusterContext);
        }

        return {
          clusterContext: nextClusterContext,
          clusterInfo: nextClusterInfo,
          templates: nextTemplates,
          items: nextItems,
          systemConfig: nextSystemConfig,
        };
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "加载失败");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [ensureWorkspaceTokenReady, resolveClusterContext],
  );

  const loadItemsSilently = useCallback(async () => {
    try {
      const nextClusterContext = await resolveClusterContext();
      const nextClusterInfo =
        clusterInfo || (await getClusterInfo(nextClusterContext));
      const nextTemplates =
        templates.length > 0
          ? templates
          : hydrateTemplateCatalog((await listAgentTemplates()).items);
      const agentsPayload = await listAgents(nextClusterContext);
      const nextItems = mapBackendAgentsToListItems(
        agentsPayload?.items || [],
        nextTemplates,
        nextClusterInfo,
      );

      setClusterContext(nextClusterContext);
      setClusterInfo(nextClusterInfo);
      setTemplates(nextTemplates);
      setItems((current) => {
        const currentSignature = current
          .map(
            (item) =>
              `${item.name}:${item.status}:${item.ready}:${item.updatedAt}:${item.bootstrapPhase}:${item.bootstrapMessage}`,
          )
          .join("|");
        const nextSignature = nextItems
          .map(
            (item) =>
              `${item.name}:${item.status}:${item.ready}:${item.updatedAt}:${item.bootstrapPhase}:${item.bootstrapMessage}`,
          )
          .join("|");
        return currentSignature === nextSignature ? current : nextItems;
      });

      return nextItems;
    } catch (error) {
      console.warn("[agent-hub] silent refresh failed", error);
      return null;
    }
  }, [clusterInfo, resolveClusterContext, templates]);

  useEffect(() => {
    void loadAll({ ensureWorkspaceToken: true });
  }, [loadAll]);

  useEffect(() => {
    const hasPendingItems = items.some(
      (item) =>
        item.status === "creating" ||
        (item.status === "running" && !item.ready),
    );

    if (!hasPendingItems) {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    if (!refreshTimerRef.current) {
      refreshTimerRef.current = window.setInterval(() => {
        void loadItemsSilently();
      }, 3000);
    }

    return () => {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [items, loadItemsSilently]);

  const primeItem = useCallback((item: AgentListItem) => {
    setItems((current) => {
      const nextIndex = current.findIndex((entry) => entry.name === item.name);
      if (nextIndex === -1) {
        return [item, ...current];
      }

      const nextItems = [...current];
      nextItems[nextIndex] = item;
      return nextItems;
    });
  }, []);

  const prepareCreateBlueprint = useCallback(
    async (templateId: string): Promise<AgentBlueprint> => {
      const currentContext = clusterContext || (await resolveClusterContext());
      const template = templatesById[templateId] || null;

      if (!template) {
        throw new Error("没有找到对应的模板目录项。");
      }
      if (!template.backendSupported) {
        throw new Error(
          template.createDisabledReason || "当前模板暂未接入后端管理 API。",
        );
      }

      const seed = getCreateBlueprint(currentContext, undefined, []);
      const defaultModelOption = getDefaultModelOption(template);
      if (template.modelOptions.length > 0 && !workspaceAIProxyModelBaseURL) {
        throw new Error("系统未提供 AI-Proxy 模型地址，当前模板无法创建。");
      }

      const workspaceToken = defaultModelOption
        ? await ensureWorkspaceTokenReady(currentContext)
        : null;

      return {
        ...createEmptyBlueprint(),
        appName: ensureDns1035Name(seed.appName, "agent"),
        aliasName: "",
        namespace: currentContext.namespace,
        image: template.image,
        productType: template.id,
        state: seed.state === "Paused" ? "Paused" : "Running",
        runtimeClassName: seed.runtimeClassName,
        storageLimit: seed.storageLimit,
        port: template.port,
        cpu: "2000m",
        memory: "4096Mi",
        serviceType: "ClusterIP",
        protocol: "TCP",
        user: template.user || seed.user,
        workingDir: template.workingDir || seed.workingDir,
        argsText: template.defaultArgs.join(" "),
        modelProvider: defaultModelOption?.provider || "",
        modelBaseURL: workspaceAIProxyModelBaseURL,
        model: defaultModelOption?.value || "",
        hasModelAPIKey: Boolean(workspaceToken?.key),
        keySource: workspaceToken?.key ? "workspace-aiproxy" : "unset",
      };
    },
    [
      clusterContext,
      ensureWorkspaceTokenReady,
      resolveClusterContext,
      templatesById,
      workspaceAIProxyModelBaseURL,
    ],
  );

  const buildCreatePayload = useCallback(
    (source: AgentBlueprint) => ({
      "template-id": source.productType,
      "agent-name": ensureDns1035Name(source.appName, "agent"),
      "agent-cpu": source.cpu,
      "agent-memory": source.memory,
      "agent-storage": source.storageLimit,
      "agent-alias-name": source.aliasName.trim(),
    }),
    [],
  );

  const buildRuntimeUpdatePayload = useCallback(
    (source: AgentBlueprint) => ({
      "agent-cpu": source.cpu,
      "agent-memory": source.memory,
      "agent-storage": source.storageLimit,
    }),
    [],
  );

  const buildSettingsPayload = useCallback(
    (template: AgentTemplateDefinition, source: AgentBlueprint) =>
      template.settings.agent.reduce<Record<string, string>>(
        (result, field) => {
          if (field.readOnly && field.binding.kind === "derived") {
            return result;
          }
          result[field.key] = readBlueprintSettingValue(source, field).trim();
          return result;
        },
        {},
      ),
    [],
  );

  const buildSettingsUpdatePayload = useCallback(
    (template: AgentTemplateDefinition, source: AgentBlueprint) => ({
      "agent-alias-name": source.aliasName.trim(),
      settings: buildSettingsPayload(template, source),
    }),
    [buildSettingsPayload],
  );

  const createAgentFromBlueprint = useCallback(
    async (blueprint: AgentBlueprint) => {
      const currentContext = clusterContext || (await resolveClusterContext());
      const aliasName = blueprint.aliasName.trim();
      const template = templatesById[blueprint.productType];

      if (!template) {
        throw new Error("没有找到对应的模板目录项。");
      }
      if (!aliasName) {
        throw new Error("请填写 Agent 别名");
      }
      const requiredSettingError = getRequiredTemplateSettingError(
        blueprint,
        template.settings.agent,
      );
      if (requiredSettingError) {
        throw new Error(requiredSettingError);
      }

      setSubmitting(true);
      try {
        if (template.modelOptions.length > 0) {
          await ensureWorkspaceTokenReady(currentContext);
        }

        const response = await createAgent(
          {
            ...buildCreatePayload({
              ...blueprint,
              appName: ensureDns1035Name(blueprint.appName, "agent"),
              aliasName,
            }),
            settings: buildSettingsPayload(template, blueprint),
          },
          currentContext,
        );

        const createdAgent = response?.agent || null;
        const snapshot = await loadAll();
        const createdItem =
          snapshot?.items.find(
            (item) => item.name === createdAgent?.core?.name,
          ) ||
          (createdAgent && templates.length
            ? mapBackendAgentsToListItems(
                [createdAgent as AgentContract],
                templates,
                snapshot?.clusterInfo || clusterInfo,
              )[0]
            : null) ||
          null;

        setMessage(
          `已创建 ${getAgentLabel(aliasName, createdAgent?.core?.name || blueprint.appName)}`,
        );

        return {
          agentName: createdAgent?.core?.name || blueprint.appName,
          aliasName: aliasName,
          item: createdItem,
          response,
        };
      } finally {
        setSubmitting(false);
      }
    },
    [
      buildCreatePayload,
      buildSettingsPayload,
      clusterContext,
      clusterInfo,
      ensureWorkspaceTokenReady,
      getAgentLabel,
      loadAll,
      resolveClusterContext,
      templates,
      templatesById,
    ],
  );

  const updateAgentRuntimeFromBlueprint = useCallback(
    async (item: AgentListItem, blueprint: AgentBlueprint) => {
      const currentContext = clusterContext || (await resolveClusterContext());
      const cpu = blueprint.cpu.trim();
      const memory = blueprint.memory.trim();
      const storage = blueprint.storageLimit.trim();

      if (!cpu) {
        throw new Error("请填写 CPU");
      }
      if (!memory) {
        throw new Error("请填写内存");
      }
      if (!storage) {
        throw new Error("请填写存储");
      }

      setSubmitting(true);
      try {
        const response = await updateAgentRuntime(
          item.name,
          buildRuntimeUpdatePayload({
            ...blueprint,
            appName: ensureDns1035Name(blueprint.appName, "agent"),
          }),
          currentContext,
        );

        setMessage(
          `已更新 ${getAgentLabel(item.aliasName, item.name)} 的运行时设置`,
        );
        await loadAll();

        return {
          agentName: item.name,
          response,
        };
      } finally {
        setSubmitting(false);
      }
    },
    [
      buildRuntimeUpdatePayload,
      clusterContext,
      getAgentLabel,
      loadAll,
      resolveClusterContext,
    ],
  );

  const updateAgentSettingsFromBlueprint = useCallback(
    async (item: AgentListItem, blueprint: AgentBlueprint) => {
      const currentContext = clusterContext || (await resolveClusterContext());
      const aliasName = blueprint.aliasName.trim();
      const template = templatesById[item.templateId];

      if (!template) {
        throw new Error("没有找到对应的模板目录项。");
      }
      if (!aliasName) {
        throw new Error("请填写 Agent 别名");
      }
      const requiredSettingError = getRequiredTemplateSettingError(
        blueprint,
        template.settings.agent,
      );
      if (requiredSettingError) {
        throw new Error(requiredSettingError);
      }

      setSubmitting(true);
      try {
        if (template.modelOptions.length > 0) {
          await ensureWorkspaceTokenReady(currentContext);
        }
        const response = await updateAgentSettings(
          item.name,
          buildSettingsUpdatePayload(template, {
            ...blueprint,
            appName: ensureDns1035Name(blueprint.appName, "agent"),
            aliasName,
          }),
          currentContext,
        );

        setMessage(
          `已更新 ${getAgentLabel(aliasName, item.name)} 的 Agent 设置`,
        );
        await loadAll();

        return {
          agentName: item.name,
          aliasName,
          response,
        };
      } finally {
        setSubmitting(false);
      }
    },
    [
      buildSettingsUpdatePayload,
      clusterContext,
      ensureWorkspaceTokenReady,
      getAgentLabel,
      loadAll,
      resolveClusterContext,
      templatesById,
    ],
  );

  const deleteAgentItem = useCallback(
    async (item: AgentListItem) => {
      const currentContext = clusterContext || (await resolveClusterContext());
      setDeleting(true);
      try {
        await deleteAgent(item.name, currentContext);
        setMessage(`已删除 ${getAgentLabel(item.aliasName, item.name)}`);
        await loadAll();
      } finally {
        setDeleting(false);
      }
    },
    [clusterContext, getAgentLabel, loadAll, resolveClusterContext],
  );

  const toggleItemState = useCallback(
    async (item: AgentListItem) => {
      const currentContext = clusterContext || (await resolveClusterContext());

      if (item.status === "running") {
        await pauseAgent(item.name, currentContext);
        setMessage(`已暂停 ${getAgentLabel(item.aliasName, item.name)}`);
      } else if (item.status === "stopped") {
        await runAgent(item.name, currentContext);
        setMessage(`已启动 ${getAgentLabel(item.aliasName, item.name)}`);
      } else {
        return;
      }

      await loadAll();
    },
    [clusterContext, getAgentLabel, loadAll, resolveClusterContext],
  );

  const findItemByName = useCallback(
    (agentName: string) =>
      items.find((item) => item.name === agentName) || null,
    [items],
  );

  const findLoadedTemplateById = useCallback(
    (templateId: string) => findTemplateById(templates, templateId),
    [templates],
  );

  return {
    items,
    templates,
    templatesById,
    clusterInfo,
    clusterContext,
    loading,
    submitting,
    deleting,
    message,
    setMessage,
    systemConfig,
    workspaceAIProxyToken,
    workspaceRegion,
    workspaceAIProxyModelBaseURL,
    loadAll,
    loadItemsSilently,
    prepareCreateBlueprint,
    createAgentFromBlueprint,
    updateAgentRuntimeFromBlueprint,
    updateAgentSettingsFromBlueprint,
    deleteAgentItem,
    toggleItemState,
    ensureWorkspaceTokenReady,
    findItemByName,
    findTemplateById: findLoadedTemplateById,
    primeItem,
    createBlueprintFromAgentItem,
  };
}
