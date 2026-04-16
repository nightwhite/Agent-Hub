package handler

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	"k8s.io/client-go/kubernetes"
)

const (
	hermesConfigTimeout      = 90 * time.Second
	hermesConfigPollInterval = 2 * time.Second
)

const hermesFallbackConfigScript = `#!/usr/bin/env bash
set -euo pipefail

HERMES_HOME="${HERMES_HOME:-/opt/data}"
INSTALL_DIR="${INSTALL_DIR:-/opt/hermes}"
PYTHON_BIN="${HERMES_PYTHON_BIN:-${INSTALL_DIR}/.venv/bin/python}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python3"
fi

mkdir -p "${HERMES_HOME}"

if [[ ! -f "${HERMES_HOME}/.env" && -f "${INSTALL_DIR}/.env.example" ]]; then
  cp "${INSTALL_DIR}/.env.example" "${HERMES_HOME}/.env"
fi

if [[ ! -f "${HERMES_HOME}/config.yaml" && -f "${INSTALL_DIR}/cli-config.yaml.example" ]]; then
  cp "${INSTALL_DIR}/cli-config.yaml.example" "${HERMES_HOME}/config.yaml"
fi

"${PYTHON_BIN}" <<'PY'
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import yaml


def atomic_write(path: Path, content: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


def load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


def update_env_file(path: Path, values: dict[str, str]) -> None:
    existing: list[str] = []
    if path.exists():
        existing = path.read_text(encoding="utf-8").splitlines()

    remaining = dict(values)
    output: list[str] = []
    for line in existing:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            output.append(line)
            continue

        key, _, _ = line.partition("=")
        key = key.strip()
        if key in remaining:
            output.append(f"{key}={remaining.pop(key)}")
        else:
            output.append(line)

    for key, value in remaining.items():
        output.append(f"{key}={value}")

    atomic_write(path, "\n".join(output).rstrip() + "\n")


def normalize_aiproxy_base_url(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""

    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return raw

    host = (parsed.hostname or "").strip().lower()
    path = (parsed.path or "").rstrip("/")
    if host.startswith("aiproxy.") and not path:
        parsed = parsed._replace(path="/v1")
        return urlunparse(parsed).rstrip("/")

    return raw.rstrip("/")


hermes_home = Path(os.environ.get("HERMES_HOME", "/opt/data"))
config_path = hermes_home / "config.yaml"
env_path = hermes_home / ".env"

config = load_yaml(config_path)
model_cfg = config.get("model")
if not isinstance(model_cfg, dict):
    model_cfg = {}
config["model"] = model_cfg

provider = os.environ.get("AGENT_MODEL_PROVIDER", "").strip() or "custom"
base_url = normalize_aiproxy_base_url(os.environ.get("AGENT_MODEL_BASEURL", ""))
model_name = os.environ.get("AGENT_MODEL", "").strip()

model_cfg["provider"] = provider
if base_url:
    model_cfg["base_url"] = base_url
if model_name:
    model_cfg["default"] = model_name

atomic_write(
    config_path,
    yaml.safe_dump(config, sort_keys=False, allow_unicode=True),
)

env_updates = {}
api_key = os.environ.get("AGENT_MODEL_APIKEY", "").strip()
if api_key:
    env_updates["OPENAI_API_KEY"] = api_key
if base_url:
    env_updates["OPENAI_BASE_URL"] = base_url

if env_updates:
    update_env_file(env_path, env_updates)
PY
`

func configureHermesModelAsync(factory *kube.Factory, spec agent.Agent) {
	if factory == nil || strings.TrimSpace(spec.Name) == "" {
		return
	}

	agentSpec := spec
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), hermesConfigTimeout)
		defer cancel()

		if err := configureHermesModel(ctx, factory, agentSpec); err != nil {
			log.Printf("failed to configure hermes model for %s/%s: %v", factory.Namespace(), agentSpec.Name, err)
		}
	}()
}

func configureHermesModel(ctx context.Context, factory *kube.Factory, spec agent.Agent) error {
	if factory == nil {
		return fmt.Errorf("kube factory is nil")
	}

	clientset, err := factory.Kubernetes()
	if err != nil {
		return fmt.Errorf("build kubernetes clientset: %w", err)
	}

	if _, err := waitForAgentPod(ctx, clientset, factory, spec.Name); err != nil {
		return err
	}

	return execHermesConfigScript(ctx, clientset, factory, spec.Name)
}

func waitForAgentPod(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string) (kube.PodRef, error) {
	ticker := time.NewTicker(hermesConfigPollInterval)
	defer ticker.Stop()

	for {
		pod, err := kube.ResolveAgentPod(ctx, clientset, factory.Namespace(), agentName)
		if err == nil {
			return pod, nil
		}

		select {
		case <-ctx.Done():
			return kube.PodRef{}, fmt.Errorf("agent pod %s is not ready: %w", agentName, ctx.Err())
		case <-ticker.C:
		}
	}
}

func normalizeHermesProvider(provider, baseURL string) string {
	normalized := strings.ToLower(strings.TrimSpace(provider))
	if normalized == "" {
		if strings.TrimSpace(baseURL) != "" {
			return "custom"
		}
		return "auto"
	}

	switch normalized {
	case "openai", "openai-compatible", "openai_compatible", "compatible", "custom":
		return "custom"
	default:
		if strings.TrimSpace(baseURL) != "" && !strings.Contains(normalized, "openrouter") {
			return "custom"
		}
		return normalized
	}
}

func execHermesConfigScript(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
) error {
	stdout, stderr, err := execInAgentPodWithRetry(
		ctx,
		clientset,
		factory,
		agentName,
		[]string{"bash", "-se"},
		[]byte(hermesFallbackConfigScript),
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf(
			"hermes config fallback failed: %w (stdout=%q stderr=%q)",
			err,
			stdout,
			stderr,
		)
	}

	if strings.TrimSpace(stderr) != "" {
		log.Printf("hermes config fallback emitted stderr for %s/%s: %s", factory.Namespace(), agentName, strings.TrimSpace(stderr))
	}

	return nil
}
