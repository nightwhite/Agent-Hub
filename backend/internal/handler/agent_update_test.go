package handler

import (
	"context"
	"fmt"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestUpdateAgentResourcesRollsBackDevboxWhenServiceUpdateFails(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "demo-agent"

	repo, clientset := newUpdateAgentTestFixtures(t, namespace, agentName)
	clientset.PrependReactor("update", "services", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("service update boom")
	})

	newAlias := "New Alias"
	_, _, err := updateAgentResources(context.Background(), repo, clientset, namespace, agentName, dto.UpdateAgentRequest{
		AgentAliasName: &newAlias,
	})
	if err == nil {
		t.Fatal("updateAgentResources() error = nil, want service update failure")
	}

	devbox, getErr := repo.Get(context.Background(), agentName)
	if getErr != nil {
		t.Fatalf("repo.Get() error = %v", getErr)
	}
	if got := devbox.GetAnnotations()["agent.sealos.io/alias-name"]; got != "Old Alias" {
		t.Fatalf("devbox alias after rollback = %q, want Old Alias", got)
	}
}

func TestUpdateAgentResourcesRollsBackDevboxAndServiceWhenIngressUpdateFails(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "demo-agent"

	repo, clientset := newUpdateAgentTestFixtures(t, namespace, agentName)
	clientset.PrependReactor("update", "ingresses", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("ingress update boom")
	})

	newAlias := "New Alias"
	_, _, err := updateAgentResources(context.Background(), repo, clientset, namespace, agentName, dto.UpdateAgentRequest{
		AgentAliasName: &newAlias,
	})
	if err == nil {
		t.Fatal("updateAgentResources() error = nil, want ingress update failure")
	}

	devbox, getErr := repo.Get(context.Background(), agentName)
	if getErr != nil {
		t.Fatalf("repo.Get() error = %v", getErr)
	}
	if got := devbox.GetAnnotations()["agent.sealos.io/alias-name"]; got != "Old Alias" {
		t.Fatalf("devbox alias after rollback = %q, want Old Alias", got)
	}

	service, serviceErr := clientset.CoreV1().Services(namespace).Get(context.Background(), agentName, metav1.GetOptions{})
	if serviceErr != nil {
		t.Fatalf("service get error = %v", serviceErr)
	}
	if got := service.Annotations["agent.sealos.io/alias-name"]; got != "Old Alias" {
		t.Fatalf("service alias after rollback = %q, want Old Alias", got)
	}
}

func newUpdateAgentTestFixtures(t *testing.T, namespace, agentName string) (*kube.Repository, *k8sfake.Clientset) {
	t.Helper()

	devbox := &unstructured.Unstructured{
		Object: map[string]any{
			"apiVersion": "devbox.sealos.io/v1alpha2",
			"kind":       "Devbox",
			"metadata": map[string]any{
				"name":      agentName,
				"namespace": namespace,
				"labels": map[string]any{
					"app.kubernetes.io/name": "hermes-agent",
					"agent.sealos.io/name":   agentName,
				},
				"annotations": map[string]any{
					"agent.sealos.io/alias-name":     "Old Alias",
					"agent.sealos.io/model-provider": "openai",
					"agent.sealos.io/model-baseurl":  "https://aiproxy.usw-1.sealos.io",
					"agent.sealos.io/model":          "gpt-4o-mini",
				},
			},
			"spec": map[string]any{
				"resource": map[string]any{
					"cpu":    "1000m",
					"memory": "2Gi",
				},
				"storageLimit": "10Gi",
				"config": map[string]any{
					"env": []any{
						map[string]any{"name": "AGENT_MODEL_PROVIDER", "value": "openai"},
						map[string]any{"name": "AGENT_MODEL_BASEURL", "value": "https://aiproxy.usw-1.sealos.io"},
						map[string]any{"name": "AGENT_MODEL", "value": "gpt-4o-mini"},
					},
				},
			},
		},
	}

	dynamicClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			kube.ResourceGVR(): "DevboxList",
		},
	)
	repo := kube.NewRepository(dynamicClient, namespace)
	if _, err := repo.Create(context.Background(), devbox); err != nil {
		t.Fatalf("repo.Create() error = %v", err)
	}

	clientset := k8sfake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      agentName,
				Namespace: namespace,
				Annotations: map[string]string{
					"agent.sealos.io/alias-name":     "Old Alias",
					"agent.sealos.io/model-provider": "openai",
					"agent.sealos.io/model-baseurl":  "https://aiproxy.usw-1.sealos.io",
					"agent.sealos.io/model":          "gpt-4o-mini",
				},
			},
		},
		&networkingv1.Ingress{
			ObjectMeta: metav1.ObjectMeta{
				Name:      agentName,
				Namespace: namespace,
				Annotations: map[string]string{
					"agent.sealos.io/alias-name":     "Old Alias",
					"agent.sealos.io/model-provider": "openai",
					"agent.sealos.io/model-baseurl":  "https://aiproxy.usw-1.sealos.io",
					"agent.sealos.io/model":          "gpt-4o-mini",
				},
			},
		},
	)

	return repo, clientset
}
