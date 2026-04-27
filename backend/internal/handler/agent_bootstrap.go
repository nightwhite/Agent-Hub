package handler

import (
	"context"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/util/retry"
)

const bootstrapPollInterval = 3 * time.Second

func scheduleAgentBootstrap(factory *kube.Factory, cfg config.Config, templateDef agenttemplate.Definition, spec agent.Agent) {
	if factory == nil || strings.TrimSpace(spec.Name) == "" {
		return
	}

	agentSpec := spec
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), bootstrapLifecycleTimeout(templateDef))
		defer cancel()

		if err := runAgentBootstrapLifecycle(ctx, factory, cfg, templateDef, agentSpec); err != nil {
			log.Printf("agent bootstrap failed for %s/%s: %v", factory.Namespace(), agentSpec.Name, err)
		}
	}()
}

func bootstrapLifecycleTimeout(templateDef agenttemplate.Definition) time.Duration {
	total := templateDef.Bootstrap.TimeoutSeconds + templateDef.Healthcheck.TimeoutSeconds + 60
	if total < 120 {
		total = 120
	}
	return time.Duration(total) * time.Second
}

func runAgentBootstrapLifecycle(
	ctx context.Context,
	factory *kube.Factory,
	cfg config.Config,
	templateDef agenttemplate.Definition,
	spec agent.Agent,
) error {
	dynamicClient, err := factory.Dynamic()
	if err != nil {
		return fmt.Errorf("build dynamic client: %w", err)
	}
	clientset, err := factory.Kubernetes()
	if err != nil {
		return fmt.Errorf("build kubernetes clientset: %w", err)
	}

	repo := kube.NewRepository(dynamicClient, factory.Namespace())
	if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseRunning, "等待实例启动"); err != nil {
		return err
	}

	if _, err := waitForAgentPod(ctx, clientset, factory, spec.Name); err != nil {
		_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, "实例未在超时内进入可执行状态")
		return err
	}

	if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseRunning, "执行模板初始化脚本"); err != nil {
		return err
	}

	if err := executeTemplateScript(
		ctx,
		clientset,
		factory,
		spec.Name,
		templateDef.Bootstrap.Script,
		templateDef.BootstrapScriptPath(),
		templateDef.Bootstrap.TimeoutSeconds,
		bootstrapScriptEnv(spec, templateDef),
	); err != nil {
		if fallbackErr := runBootstrapFallback(ctx, factory, spec, err); fallbackErr != nil {
			message := truncateBootstrapMessage(fallbackErr.Error())
			_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, message)
			return fallbackErr
		}
	}

	if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseRunning, "等待健康检查通过"); err != nil {
		return err
	}

	if err := waitForTemplateHealthcheck(ctx, clientset, factory, spec.Name, templateDef); err != nil {
		message := truncateBootstrapMessage(err.Error())
		_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, message)
		return err
	}

	if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseReady, "实例已完成初始化"); err != nil {
		return err
	}

	return nil
}

func runBootstrapFallback(ctx context.Context, factory *kube.Factory, spec agent.Agent, bootstrapErr error) error {
	if strings.TrimSpace(spec.TemplateID) != "hermes-agent" {
		return fmt.Errorf("template bootstrap failed: %w", bootstrapErr)
	}

	if err := configureHermesModel(ctx, factory, spec); err != nil {
		return fmt.Errorf("template bootstrap failed: %w; hermes fallback failed: %v", bootstrapErr, err)
	}

	log.Printf("template bootstrap failed for %s/%s, recovered via Hermes fallback: %v", factory.Namespace(), spec.Name, bootstrapErr)
	return nil
}

func waitForTemplateHealthcheck(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
	templateDef agenttemplate.Definition,
) error {
	healthcheckScript, err := readTemplateScript(templateDef.Healthcheck.Script, templateDef.HealthcheckScriptPath())
	if err != nil {
		return err
	}

	deadline := time.Now().Add(time.Duration(templateDef.Healthcheck.TimeoutSeconds) * time.Second)
	var lastErr error

	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			if lastErr != nil {
				return fmt.Errorf("healthcheck did not pass before timeout: %w", lastErr)
			}
			return fmt.Errorf("healthcheck did not pass before timeout")
		}

		attemptCtx, cancel := context.WithTimeout(ctx, minDuration(remaining, 10*time.Second))
		lastErr = executeTemplateScriptContent(
			attemptCtx,
			clientset,
			factory,
			agentName,
			templateDef.Healthcheck.Script,
			healthcheckScript,
			0,
			nil,
		)
		cancel()
		if lastErr == nil {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(bootstrapPollInterval):
		}
	}
}

func executeTemplateScript(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
	scriptName string,
	scriptPath string,
	timeoutSeconds int,
	env map[string]string,
) error {
	raw, err := readTemplateScript(scriptName, scriptPath)
	if err != nil {
		return err
	}

	return executeTemplateScriptContent(
		ctx,
		clientset,
		factory,
		agentName,
		scriptName,
		raw,
		timeoutSeconds,
		env,
	)
}

func readTemplateScript(scriptName, scriptPath string) ([]byte, error) {
	raw, err := os.ReadFile(scriptPath)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", scriptName, err)
	}
	return raw, nil
}

func executeTemplateScriptContent(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
	scriptName string,
	raw []byte,
	timeoutSeconds int,
	env map[string]string,
) error {
	execCtx := ctx
	var cancel context.CancelFunc
	if timeoutSeconds > 0 {
		execCtx, cancel = context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
		defer cancel()
	}

	command := []string{"bash", "-se"}
	payload := withTemplateScriptEnv(raw, env)

	stdout, stderr, err := execInAgentPodWithRetry(
		execCtx,
		clientset,
		factory,
		agentName,
		command,
		payload,
		false,
		nil,
	)
	if err != nil {
		stdout = redactTemplateScriptOutput(stdout, env)
		stderr = redactTemplateScriptOutput(stderr, env)
		return fmt.Errorf(
			"%s failed: %w (stdout=%q stderr=%q)",
			scriptName,
			err,
			stdout,
			stderr,
		)
	}

	return nil
}

func redactTemplateScriptOutput(value string, env map[string]string) string {
	redacted := value
	for key, rawValue := range env {
		if !isSensitiveEnvKey(key) {
			continue
		}
		secret := strings.TrimSpace(rawValue)
		if secret == "" {
			continue
		}
		redacted = strings.ReplaceAll(redacted, secret, "[REDACTED]")
	}
	return redacted
}

func isSensitiveEnvKey(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	return strings.Contains(normalized, "key") ||
		strings.Contains(normalized, "token") ||
		strings.Contains(normalized, "secret") ||
		strings.Contains(normalized, "password")
}

func bootstrapScriptEnv(spec agent.Agent, templateDef agenttemplate.Definition) map[string]string {
	env := map[string]string{
		"AGENT_TEMPLATE_ID":         spec.TemplateID,
		"AGENT_WORKDIR":             firstNonEmpty(spec.WorkingDir, templateDef.WorkingDir),
		"AGENT_MODEL_PROVIDER":      spec.ModelProvider,
		"AGENT_MODEL_BASEURL":       spec.ModelBaseURL,
		"AGENT_MODEL_APIKEY":        spec.ModelAPIKey,
		"AGENT_MODEL":               spec.Model,
		"HERMES_INFERENCE_PROVIDER": spec.ModelProvider,
		"API_SERVER_KEY":            spec.APIServerKey,
	}
	if templateDef.Port > 0 {
		env["API_SERVER_PORT"] = fmt.Sprintf("%d", templateDef.Port)
	}
	if isManagedBootstrapProvider(spec.ModelProvider) {
		env["AIPROXY_API_KEY"] = spec.ModelAPIKey
		env["OPENAI_BASE_URL"] = ""
		env["OPENAI_API_KEY"] = ""
	} else {
		env["AIPROXY_API_KEY"] = ""
		env["OPENAI_BASE_URL"] = spec.ModelBaseURL
		env["OPENAI_API_KEY"] = spec.ModelAPIKey
	}
	return env
}

func isManagedBootstrapProvider(value string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(value)), "custom:aiproxy-")
}

func withTemplateScriptEnv(raw []byte, env map[string]string) []byte {
	if len(env) == 0 {
		return raw
	}

	keys := make([]string, 0, len(env))
	for key := range env {
		if strings.TrimSpace(key) == "" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	if len(keys) == 0 {
		return raw
	}

	var builder strings.Builder
	builder.WriteString("set -a\n")
	for _, key := range keys {
		builder.WriteString(key)
		builder.WriteByte('=')
		builder.WriteString(shellQuote(env[key]))
		builder.WriteByte('\n')
	}
	builder.WriteString("set +a\n")
	builder.Write(raw)
	if len(raw) == 0 || raw[len(raw)-1] != '\n' {
		builder.WriteByte('\n')
	}
	return []byte(builder.String())
}

func shellQuote(value string) string {
	if value == "" {
		return "''"
	}
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func persistBootstrapStatus(ctx context.Context, repo *kube.Repository, agentName, phase, message string) error {
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		devbox, err := repo.Get(ctx, agentName)
		if err != nil {
			return err
		}
		if err := kube.SetBootstrapStatus(devbox, phase, truncateBootstrapMessage(message)); err != nil {
			return err
		}
		_, err = repo.Update(ctx, devbox)
		return err
	})
}

func truncateBootstrapMessage(message string) string {
	const maxLength = 1024
	trimmed := strings.TrimSpace(message)
	if len(trimmed) <= maxLength {
		return trimmed
	}
	return trimmed[:maxLength]
}

func minDuration(left, right time.Duration) time.Duration {
	if left < right {
		return left
	}
	return right
}

func bootstrapTemplateID(templateID string) string {
	return strings.TrimSpace(templateID)
}

func updateBootstrapMetadata(devbox *unstructured.Unstructured, templateID string) error {
	if strings.TrimSpace(templateID) == "" {
		return fmt.Errorf("template id is required")
	}
	if err := kube.SetTemplateID(devbox, bootstrapTemplateID(templateID)); err != nil {
		return err
	}
	return kube.SetBootstrapStatus(devbox, kube.BootstrapPhasePending, "等待实例初始化")
}
