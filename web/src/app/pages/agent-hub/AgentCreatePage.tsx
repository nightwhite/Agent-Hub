import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AgentConfigForm } from "../../../components/business/agents/AgentConfigForm";
import { Button } from "../../../components/ui/Button";
import { AgentCreateSidebar } from "./components/AgentCreateSidebar";
import { AgentCreateHeader } from "./components/AgentCreateHeader";
import { AgentHubOverview } from "./components/AgentHubOverview";
import { AgentWorkspaceShell } from "./components/AgentWorkspaceShell";
import { AGENT_HUB_DIALOG_CONTENT_CLASSNAME } from "./components/workspaceLayout";
import { useAgentHub } from "./hooks/AgentHubControllerContext";
import { applyBlueprintPreset, updateBlueprintField } from "./lib/blueprint";
import { buildAgentDetailRouteState } from "./lib/navigation";
import { createEmptyBlueprint } from "../../../domains/agents/templates";
import { writeBlueprintSettingValue } from "../../../domains/agents/blueprintFields";
import type { AgentBlueprint } from "../../../domains/agents/types";
import { cn } from "../../../lib/format";

export function AgentCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const controller = useAgentHub();
  const {
    clusterContext,
    loading,
    message,
    submitting,
    templates,
    workspaceRegion,
    workspaceAIProxyModelBaseURL,
    workspaceAIProxyToken,
    prepareCreateBlueprint,
    createAgentFromBlueprint,
    findTemplateById,
    setMessage,
  } = controller;
  const [blueprint, setBlueprint] = useState<AgentBlueprint>(() =>
    createEmptyBlueprint(),
  );
  const selectedTemplateId = useMemo(
    () => String(searchParams.get("template") || "").trim(),
    [searchParams],
  );
  const selectedTemplate = findTemplateById(selectedTemplateId);

  useEffect(() => {
    if (!selectedTemplateId) {
      navigate("/agents/templates", { replace: true });
    }
  }, [navigate, selectedTemplateId]);

  useEffect(() => {
    if (loading) return;
    if (!selectedTemplateId) return;
    if (!selectedTemplate && templates.length > 0) {
      navigate("/agents/templates", { replace: true });
    }
  }, [
    loading,
    navigate,
    selectedTemplate,
    selectedTemplateId,
    templates.length,
  ]);

  useEffect(() => {
    if (!selectedTemplateId || !clusterContext) return;

    let disposed = false;

    void prepareCreateBlueprint(selectedTemplateId)
      .then((nextBlueprint) => {
        if (disposed) return;
        setBlueprint(nextBlueprint);
      })
      .catch((error) => {
        if (disposed) return;
        setMessage(error instanceof Error ? error.message : "加载创建模板失败");
      });

    return () => {
      disposed = true;
    };
  }, [clusterContext, prepareCreateBlueprint, selectedTemplateId, setMessage]);

  const handleBlueprintChange = (
    field: keyof AgentBlueprint,
    value: string,
  ) => {
    setBlueprint((current) => updateBlueprintField(current, field, value));
  };

  const handleSelectPreset = (presetId: AgentBlueprint["profile"]) => {
    setBlueprint((current) => applyBlueprintPreset(current, presetId));
  };

  const handleSubmit = async () => {
    try {
      const result = await createAgentFromBlueprint(blueprint);
      navigate(`/agents/${result.agentName}`, {
        state: buildAgentDetailRouteState(result.item || null, "create"),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败");
    }
  };

  const blueprintReady = Boolean(
    selectedTemplateId &&
    clusterContext &&
    blueprint.productType === selectedTemplateId &&
    blueprint.namespace === clusterContext.namespace,
  );
  const waitingForBlueprint =
    loading ||
    (Boolean(selectedTemplateId) && Boolean(clusterContext) && !blueprintReady);
  const missingClusterContext = !loading && !clusterContext;

  return (
    <AgentWorkspaceShell>
      <div className="flex h-full flex-col">
        <AgentCreateHeader
          description={
            selectedTemplate
              ? `按 ${selectedTemplate.name} 模板创建新的 Agent 实例`
              : undefined
          }
          onBack={() => navigate("/agents/templates")}
          title={
            selectedTemplate
              ? `创建 ${selectedTemplate.shortName}`
              : "创建 Agent"
          }
          actions={
            <>
              <Button
                onClick={() => navigate("/agents/templates")}
                size="md"
                variant="secondary"
              >
                更换模板
              </Button>
              <Button
                className="rounded-xl"
                onClick={() => navigate("/agents")}
                size="md"
                variant="ghost"
              >
                取消
              </Button>
              <Button
                className="rounded-xl font-semibold"
                disabled={
                  submitting || waitingForBlueprint || missingClusterContext
                }
                onClick={handleSubmit}
                size="md"
              >
                {submitting ? "部署中..." : "确认部署"}
              </Button>
            </>
          }
        />

        <main className="flex min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              AGENT_HUB_DIALOG_CONTENT_CLASSNAME,
              "flex flex-col gap-4 pt-4 pb-6",
            )}
          >
            <AgentHubOverview message={message} />

            <div className="grid w-full items-start gap-4 min-[980px]:grid-cols-[260px_minmax(0,1fr)] min-[1320px]:grid-cols-[280px_minmax(0,1fr)]">
              {selectedTemplate ? (
                <AgentCreateSidebar
                  blueprint={blueprint}
                  template={selectedTemplate}
                />
              ) : null}

              <section className="min-w-0 w-full max-w-[860px] justify-self-center min-[980px]:max-w-none min-[980px]:justify-self-auto">
                {waitingForBlueprint ? (
                  <div className="workbench-card-strong flex min-h-[420px] flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                      正在准备
                    </div>
                    <div className="mt-2 text-[1.35rem]/8 font-semibold tracking-[-0.03em] text-zinc-950">
                      正在准备创建配置
                    </div>
                    <div className="mt-2 max-w-[28rem] text-[13px]/6 text-zinc-500">
                      正在读取模板与默认配置，请稍候。
                    </div>
                  </div>
                ) : missingClusterContext ? (
                  <div className="workbench-card-strong flex min-h-[420px] flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                      暂时不可用
                    </div>
                    <div className="mt-2 text-[1.35rem]/8 font-semibold tracking-[-0.03em] text-zinc-950">
                      当前工作区还没准备好
                    </div>
                    <div className="mt-2 max-w-[30rem] text-[13px]/6 text-zinc-500">
                      请先返回列表页再重新进入，然后继续创建。
                    </div>
                    <div className="mt-5">
                      <Button
                        className="rounded-xl"
                        onClick={() => navigate("/agents")}
                        size="md"
                        variant="secondary"
                      >
                        返回列表页
                      </Button>
                    </div>
                  </div>
                ) : (
                  <AgentConfigForm
                    blueprint={blueprint}
                    mode="create"
                    onChange={handleBlueprintChange}
                    onChangeSettingField={(field, value) => {
                      setBlueprint((current) =>
                        writeBlueprintSettingValue(current, field, value),
                      );
                    }}
                    onChangeTemplate={() => navigate("/agents/templates")}
                    onSelectPreset={handleSelectPreset}
                    template={selectedTemplate}
                    workspaceRegion={workspaceRegion}
                    workspaceModelBaseURL={workspaceAIProxyModelBaseURL}
                    workspaceModelKeyReady={Boolean(workspaceAIProxyToken?.key)}
                  />
                )}
              </section>
            </div>
          </div>
        </main>
      </div>
    </AgentWorkspaceShell>
  );
}
