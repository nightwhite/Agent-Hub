package kube

import (
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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
	if got := objects.Service.Spec.Selector["agent.sealos.io/name"]; got != ag.Name {
		t.Fatalf("Build() service selector agent.sealos.io/name = %q, want %q", got, ag.Name)
	}
	configLabels, found, err := unstructured.NestedStringMap(objects.Devbox.Object, "spec", "config", "labels")
	if err != nil || !found {
		t.Fatalf("Build() config labels missing: found=%v err=%v", found, err)
	}
	if got := configLabels["agent.sealos.io/name"]; got != ag.Name {
		t.Fatalf("Build() config label agent.sealos.io/name = %q, want %q", got, ag.Name)
	}
}

func TestBuildDoesNotLeakIngressAnnotationsToOtherResources(t *testing.T) {
	t.Parallel()

	ag := agent.Agent{
		Name:          "annotation-isolation",
		Namespace:     "ns-test",
		CPU:           "1000m",
		Memory:        "2Gi",
		Storage:       "10Gi",
		ModelProvider: "openai",
		ModelBaseURL:  "https://api.openai.com/v1",
		Model:         "gpt-4o-mini",
		APIServerKey:  "generated-api-key",
	}

	objects, err := Build(ag, "annotation-isolation.agent.usw-1.sealos.app", "nousresearch/hermes-agent:latest")
	if err != nil {
		t.Fatalf("Build() returned error: %v", err)
	}

	if got := objects.Service.Annotations["nginx.ingress.kubernetes.io/proxy-body-size"]; got != "" {
		t.Fatalf("Build() service unexpectedly leaked ingress annotation = %q", got)
	}

	devboxAnnotations := objects.Devbox.GetAnnotations()
	if got := devboxAnnotations["nginx.ingress.kubernetes.io/proxy-body-size"]; got != "" {
		t.Fatalf("Build() devbox unexpectedly leaked ingress annotation = %q", got)
	}

	if got := objects.Ingress.Annotations["nginx.ingress.kubernetes.io/proxy-body-size"]; got != "32m" {
		t.Fatalf("Build() ingress proxy-body-size = %q, want 32m", got)
	}
}

func TestSetOwnerReferenceAssignsControllerOwner(t *testing.T) {
	t.Parallel()

	owner := &unstructured.Unstructured{}
	owner.SetAPIVersion("devbox.sealos.io/v1alpha2")
	owner.SetKind("Devbox")
	owner.SetName("demo-agent")
	owner.SetUID("uid-123")

	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "demo-agent",
			Namespace: "ns-test",
		},
	}

	SetOwnerReference(service, owner)
	if len(service.OwnerReferences) != 1 {
		t.Fatalf("SetOwnerReference() owner ref count = %d, want 1", len(service.OwnerReferences))
	}
	ref := service.OwnerReferences[0]
	if ref.Name != "demo-agent" || ref.Kind != "Devbox" || string(ref.UID) != "uid-123" {
		t.Fatalf("SetOwnerReference() owner ref = %#v", ref)
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
