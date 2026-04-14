package kube

import (
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestBuildReturnsKubernetesObjects(t *testing.T) {
	t.Parallel()

	ag := agent.Agent{
		Name:          "e2e-repro",
		AliasName:     "E2E测试",
		Namespace:     "ns-38cq5qwz",
		CPU:           "1000m",
		Memory:        "2Gi",
		Storage:       "10Gi",
		ModelProvider: "openai",
		ModelBaseURL:  "https://api.openai.com/v1",
		ModelAPIKey:   "secret-key",
		Model:         "gpt-4o-mini",
		APIServerKey:  "generated-api-key",
	}

	objects, err := Build(ag, "example-agent.usw-1.sealos.app", "nousresearch/hermes-agent:latest")
	if err != nil {
		t.Fatalf("Build() returned error: %v", err)
	}
	if objects.Devbox == nil {
		t.Fatal("Build() returned nil devbox")
	}
	if objects.Service == nil {
		t.Fatal("Build() returned nil service")
	}
	if objects.Ingress == nil {
		t.Fatal("Build() returned nil ingress")
	}
	if got := objects.Devbox.GetName(); got != ag.Name {
		t.Fatalf("Build() devbox name = %q, want %q", got, ag.Name)
	}
	if got := objects.Service.Name; got != ag.Name {
		t.Fatalf("Build() service name = %q, want %q", got, ag.Name)
	}
	if got := IngressDomain(objects.Ingress); got != "example-agent.usw-1.sealos.app" {
		t.Fatalf("Build() ingress host = %q, want %q", got, "example-agent.usw-1.sealos.app")
	}
	if got := envValue(objects.Devbox, "API_SERVER_KEY"); got != ag.APIServerKey {
		t.Fatalf("Build() API_SERVER_KEY = %q, want %q", got, ag.APIServerKey)
	}
}

func TestEnvValueReturnsEmptyStringWhenValueMissing(t *testing.T) {
	t.Parallel()

	devbox := map[string]any{
		"spec": map[string]any{
			"config": map[string]any{
				"env": []any{
					map[string]any{"name": "AGENT_MODEL_APIKEY"},
				},
			},
		},
	}

	obj := &unstructured.Unstructured{Object: devbox}
	if got := envValue(obj, "AGENT_MODEL_APIKEY"); got != "" {
		t.Fatalf("envValue() = %q, want empty string when value is missing", got)
	}
}
