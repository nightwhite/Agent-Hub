package kube

import (
	"strings"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const (
	TerminalAPIServer             = "https://kubernetes.default.svc.cluster.local:443"
	TerminalTTYImage              = "docker.io/labring4docker/terminal:1.25.1-5"
	TerminalKeepalive             = "30m"
	TerminalIngressType           = "nginx"
	TerminalDefaultReplicas int64 = 1
)

var terminalGVR = schema.GroupVersionResource{
	Group:    "terminal.sealos.io",
	Version:  "v1",
	Resource: "terminals",
}

type TerminalStatus struct {
	AvailableReplicas int64
	Domain            string
	SecretHeader      string
}

func TerminalResourceGVR() schema.GroupVersionResource {
	return terminalGVR
}

func TerminalName(userName string) string {
	normalized := strings.ToLower(strings.TrimSpace(userName))
	normalized = strings.ReplaceAll(normalized, "_", "-")
	normalized = strings.ReplaceAll(normalized, "@", "-")
	normalized = strings.ReplaceAll(normalized, ".", "-")
	normalized = strings.Trim(normalized, "-")
	if normalized == "" {
		return "terminal"
	}
	return "terminal-" + normalized
}

func BuildTerminalResource(name, namespace string, auth CurrentAuth, now time.Time) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]any{
			"apiVersion": "terminal.sealos.io/v1",
			"kind":       "Terminal",
			"metadata": map[string]any{
				"name":      strings.TrimSpace(name),
				"namespace": strings.TrimSpace(namespace),
				"annotations": map[string]any{
					"lastUpdateTime": now.UTC().Format(time.RFC3339),
				},
			},
			"spec": map[string]any{
				"user":        strings.TrimSpace(auth.UserName),
				"token":       strings.TrimSpace(auth.Token),
				"apiServer":   TerminalAPIServer,
				"ttyImage":    TerminalTTYImage,
				"replicas":    TerminalDefaultReplicas,
				"keepalived":  TerminalKeepalive,
				"ingressType": TerminalIngressType,
			},
		},
	}
}

func RefreshTerminalResource(target *unstructured.Unstructured, auth CurrentAuth, now time.Time) {
	if target == nil {
		return
	}

	annotations := target.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string, 1)
	}
	annotations["lastUpdateTime"] = now.UTC().Format(time.RFC3339)
	target.SetAnnotations(annotations)

	_ = unstructured.SetNestedField(target.Object, strings.TrimSpace(auth.UserName), "spec", "user")
	_ = unstructured.SetNestedField(target.Object, strings.TrimSpace(auth.Token), "spec", "token")
	_ = unstructured.SetNestedField(target.Object, TerminalAPIServer, "spec", "apiServer")
	_ = unstructured.SetNestedField(target.Object, TerminalTTYImage, "spec", "ttyImage")
	_ = unstructured.SetNestedField(target.Object, TerminalDefaultReplicas, "spec", "replicas")
	_ = unstructured.SetNestedField(target.Object, TerminalKeepalive, "spec", "keepalived")
	_ = unstructured.SetNestedField(target.Object, TerminalIngressType, "spec", "ingressType")
}

func TerminalStatusFromResource(obj *unstructured.Unstructured) TerminalStatus {
	if obj == nil {
		return TerminalStatus{}
	}

	status := TerminalStatus{}
	if value, found, _ := unstructured.NestedInt64(obj.Object, "status", "availableReplicas"); found {
		status.AvailableReplicas = value
	}
	if value, found, _ := unstructured.NestedString(obj.Object, "status", "domain"); found {
		status.Domain = strings.TrimSpace(value)
	}
	if value, found, _ := unstructured.NestedString(obj.Object, "status", "secretHeader"); found {
		status.SecretHeader = strings.TrimSpace(value)
	}
	return status
}

func TerminalReady(status TerminalStatus) bool {
	return strings.TrimSpace(status.Domain) != "" && strings.TrimSpace(status.SecretHeader) != ""
}
