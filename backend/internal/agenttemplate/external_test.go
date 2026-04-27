package agenttemplate

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListFromSourceReadsExternalTemplateRepository(t *testing.T) {
	t.Parallel()

	root := writeExternalTemplateFixture(t)

	definitions, err := ListFromSource(SourceOptions{GitURL: root})
	if err != nil {
		t.Fatalf("ListFromSource() error = %v", err)
	}
	if len(definitions) != 2 {
		t.Fatalf("ListFromSource() len = %d, want 2", len(definitions))
	}

	hermes := findDefinition(t, definitions, "hermes-agent")
	if hermes.Image != "agent-hub/hermes-agent:dev" {
		t.Fatalf("hermes image = %q, want external image", hermes.Image)
	}
	if hermes.User != "agent" {
		t.Fatalf("hermes user = %q, want agent", hermes.User)
	}
	if hermes.WorkingDir != "/workspace" {
		t.Fatalf("hermes workingDir = %q, want /workspace", hermes.WorkingDir)
	}
	if got := accessRootPath(hermes, "files"); got != "/workspace" {
		t.Fatalf("hermes files rootPath = %q, want /workspace", got)
	}
	if hermes.Port != 8642 {
		t.Fatalf("hermes port = %d, want 8642", hermes.Port)
	}
	if len(hermes.DefaultArgs) != 1 || hermes.DefaultArgs[0] != "start" {
		t.Fatalf("hermes defaultArgs = %#v, want [start]", hermes.DefaultArgs)
	}
	if hermes.ManifestPath() == "" {
		t.Fatal("hermes ManifestPath() is empty")
	}
	if hermes.Config.SchemaPath != "/opt/agent/config.json" {
		t.Fatalf("hermes config schema path = %q, want /opt/agent/config.json", hermes.Config.SchemaPath)
	}

	openclaw := findDefinition(t, definitions, "openclaw")
	if openclaw.Image != "agent-hub/openclaw:dev" {
		t.Fatalf("openclaw image = %q, want external image", openclaw.Image)
	}
	if openclaw.Port != 18789 {
		t.Fatalf("openclaw port = %d, want config.json gateway default port", openclaw.Port)
	}
	if got := accessRootPath(openclaw, "files"); got != "/workspace" {
		t.Fatalf("openclaw files rootPath = %q, want /workspace", got)
	}
	if !definitionHasAgentBinding(openclaw, "model") {
		t.Fatal("openclaw model binding missing, want config.json model action exposed through settings")
	}
	if len(openclaw.RegionModelPresets["us"]) == 0 {
		t.Fatal("openclaw US model presets are empty, want defaults for create/settings flow")
	}
	if !openclaw.BackendSupported {
		t.Fatal("openclaw BackendSupported = false, want true when external template is enabled")
	}
}

func TestResolveFromSourceRejectsMissingExternalTemplate(t *testing.T) {
	t.Parallel()

	root := writeExternalTemplateFixture(t)

	_, err := ResolveFromSource("missing-agent", SourceOptions{GitURL: root})
	if err == nil {
		t.Fatal("ResolveFromSource() error = nil, want missing template error")
	}
}

func TestGithubZipballURLSupportsRepositoryURLs(t *testing.T) {
	t.Parallel()

	got, ok := githubZipballURL("https://github.com/nightwhite/Agent-Hub-Template/")
	if !ok {
		t.Fatal("githubZipballURL() ok = false, want true")
	}
	if got != "https://api.github.com/repos/nightwhite/Agent-Hub-Template/zipball" {
		t.Fatalf("githubZipballURL() = %q, want GitHub API zipball URL", got)
	}

	got, ok = githubZipballURL("https://github.com/nightwhite/Agent-Hub-Template.git")
	if !ok {
		t.Fatal("githubZipballURL(.git) ok = false, want true")
	}
	if got != "https://api.github.com/repos/nightwhite/Agent-Hub-Template/zipball" {
		t.Fatalf("githubZipballURL(.git) = %q, want GitHub API zipball URL", got)
	}
}

func TestNormalizeExternalImageMapsAgentHubPlaceholderToGithubContainerRegistry(t *testing.T) {
	t.Parallel()

	got := normalizeExternalImage("agent-hub/hermes-agent:dev", "https://github.com/NightWhite/Agent-Hub-Template.git")
	if got != "ghcr.io/nightwhite/hermes-agent:dev" {
		t.Fatalf("normalizeExternalImage() = %q, want ghcr.io/nightwhite/hermes-agent:dev", got)
	}

	got = normalizeExternalImage("ghcr.io/nightwhite/hermes-agent:dev", "https://github.com/nightwhite/Agent-Hub-Template.git")
	if got != "ghcr.io/nightwhite/hermes-agent:dev" {
		t.Fatalf("normalizeExternalImage() full image = %q, want unchanged image", got)
	}

	got = normalizeExternalImage("agent-hub/hermes-agent:dev", "/tmp/agent-hub-template")
	if got != "agent-hub/hermes-agent:dev" {
		t.Fatalf("normalizeExternalImage() local source = %q, want unchanged placeholder", got)
	}
}

func findDefinition(t *testing.T, definitions []Definition, id string) Definition {
	t.Helper()
	for _, definition := range definitions {
		if definition.ID == id {
			return definition
		}
	}
	t.Fatalf("definition %q not found", id)
	return Definition{}
}

func accessRootPath(definition Definition, key string) string {
	for _, access := range definition.Access {
		if access.Key == key {
			return access.RootPath
		}
	}
	return ""
}

func writeExternalTemplateFixture(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	writeFile(t, root, "registry/agents.yaml", `agents:
  - name: hermes-agent
    path: agents/hermes-agent
    enabled: true
  - name: openclaw
    path: agents/openclaw
    enabled: true
  - name: disabled-agent
    path: agents/disabled-agent
    enabled: false
`)
	writeAgentFixture(t, root, "hermes-agent", `{
  "id": "hermes-agent",
  "icon": "https://example.com/hermes.png",
  "name": "Hermes Agent",
  "desc": "External Hermes",
  "status": "enabled",
  "image": "agent-hub/hermes-agent:index",
  "runtime": { "kind": "service" }
}`, `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: hermes-agent
          image: agent-hub/hermes-agent:dev
          env:
            - name: API_SERVER_PORT
              value: "8642"
          args: ["start"]
          workingDir: /workspace
`, `{
  "schemaVersion": "devbox-agent-config.v1",
  "script": "/opt/agent/config.sh",
  "zh": { "resources": [{"resource": "model", "actions": []}] },
  "en": { "resources": [{"resource": "model", "actions": []}] }
}`)
	writeAgentFixture(t, root, "openclaw", `{
  "id": "openclaw",
  "icon": "https://example.com/openclaw.png",
  "name": "OpenClaw",
  "desc": "External OpenClaw",
  "status": "experimental",
  "image": "agent-hub/openclaw:index",
  "runtime": { "kind": "service" }
}`, `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: openclaw
          image: agent-hub/openclaw:dev
          args: ["start"]
`, `{
  "schemaVersion": "devbox-agent-config.v1",
  "script": "/opt/agent/config.sh",
  "zh": {
    "resources": [
      {
        "resource": "model",
        "actions": [
          {
            "action": "set-main",
            "args": [
              {"name": "provider", "type": "text"},
              {"name": "model", "type": "text"}
            ]
          }
        ]
      },
      {
        "resource": "gateway",
        "actions": [
          {
            "action": "set-local",
            "args": [{"name": "port", "type": "number", "default": 18789}]
          }
        ]
      }
    ]
  },
  "en": {
    "resources": [
      {
        "resource": "model",
        "actions": [
          {
            "action": "set-main",
            "args": [
              {"name": "provider", "type": "text"},
              {"name": "model", "type": "text"}
            ]
          }
        ]
      },
      {"resource": "gateway", "actions": []}
    ]
  }
}`)
	return root
}

func writeAgentFixture(t *testing.T, root, id, index, deploy, config string) {
	t.Helper()

	base := filepath.Join("agents", id)
	writeFile(t, root, filepath.Join(base, "index.json"), index)
	writeFile(t, root, filepath.Join(base, "deploy.yaml"), deploy)
	writeFile(t, root, filepath.Join(base, "config.json"), config)
	writeFile(t, root, filepath.Join(base, "config.sh"), "#!/usr/bin/env bash\n")
}

func writeFile(t *testing.T, root, name, content string) {
	t.Helper()

	path := filepath.Join(root, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s) error = %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", path, err)
	}
}
