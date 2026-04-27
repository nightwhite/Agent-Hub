package handler

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestExternalBootstrapFallsBackToHermesDirectModelConfig(t *testing.T) {
	t.Parallel()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller() failed")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
	bootstrapPath := filepath.Join(repoRoot, "template", "devbox-agent", "bootstrap.sh")

	tempDir := t.TempDir()
	failingConfigScript := filepath.Join(tempDir, "config.sh")
	if err := os.WriteFile(failingConfigScript, []byte("#!/usr/bin/env bash\nexit 1\n"), 0o755); err != nil {
		t.Fatalf("write failing config script: %v", err)
	}

	hermesHome := filepath.Join(tempDir, "hermes")
	cmd := exec.Command("bash", bootstrapPath)
	cmd.Env = append(os.Environ(),
		"AGENT_CONFIG_SCRIPT="+failingConfigScript,
		"AGENT_TEMPLATE_ID=hermes-agent",
		"AGENT_NAME=hermes-agent",
		"HERMES_HOME="+hermesHome,
		"AGENT_MODEL_PROVIDER=custom:aiproxy-responses",
		"AGENT_MODEL_BASEURL=https://aiproxy.usw-1.sealos.io/v1",
		"AGENT_MODEL_APIKEY=test-aiproxy-key",
		"AGENT_MODEL=gpt-5.4",
		"API_SERVER_KEY=test-gateway-key",
		"API_SERVER_PORT=8642",
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("bootstrap.sh failed: %v\n%s", err, output)
	}
	for _, secret := range []string{"test-aiproxy-key", "test-gateway-key"} {
		if strings.Contains(string(output), secret) {
			t.Fatalf("bootstrap output leaked secret %q:\n%s", secret, output)
		}
	}

	configRaw, err := os.ReadFile(filepath.Join(hermesHome, "config.yaml"))
	if err != nil {
		t.Fatalf("read generated Hermes config: %v", err)
	}
	config := string(configRaw)
	for _, want := range []string{
		"provider: 'aiproxy-responses'",
		"default: 'gpt-5.4'",
		"base_url: 'https://aiproxy.usw-1.sealos.io/v1'",
		"api_mode: 'codex_responses'",
		"key_env: AIPROXY_API_KEY",
	} {
		if !strings.Contains(config, want) {
			t.Fatalf("generated config missing %q:\n%s", want, config)
		}
	}

	envRaw, err := os.ReadFile(filepath.Join(hermesHome, ".env"))
	if err != nil {
		t.Fatalf("read generated Hermes dotenv: %v", err)
	}
	if env := string(envRaw); !strings.Contains(env, "AIPROXY_API_KEY=test-aiproxy-key") {
		t.Fatalf("generated dotenv missing AIPROXY_API_KEY:\n%s", env)
	}
}

func TestTemplateScriptEnvOverridesRunningContainerEnv(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "model.txt")
	raw := []byte("printf '%s' \"$AGENT_MODEL\" > " + shellQuote(outputPath) + "\n")
	payload := withTemplateScriptEnv(raw, map[string]string{
		"AGENT_MODEL": "gpt-5.4-mini",
	})

	cmd := exec.Command("bash", "-se")
	cmd.Env = append(os.Environ(), "AGENT_MODEL=gpt-5.4")
	cmd.Stdin = bytes.NewReader(payload)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("bash payload failed: %v\n%s", err, output)
	}

	got, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if string(got) != "gpt-5.4-mini" {
		t.Fatalf("AGENT_MODEL = %q, want injected gpt-5.4-mini", got)
	}
}

func TestRedactTemplateScriptOutputMasksSensitiveEnvValues(t *testing.T) {
	t.Parallel()

	output := redactTemplateScriptOutput(
		"stdout model-key and gateway-token but harmless-value remains",
		map[string]string{
			"AGENT_MODEL_APIKEY": "model-key",
			"API_SERVER_KEY":     "gateway-token",
			"HARMLESS_ENV":       "harmless-value",
		},
	)
	for _, secret := range []string{"model-key", "gateway-token"} {
		if strings.Contains(output, secret) {
			t.Fatalf("redacted output leaked %q: %s", secret, output)
		}
	}
	if !strings.Contains(output, "harmless-value") {
		t.Fatalf("redacted output = %q, want non-sensitive values preserved", output)
	}
}
