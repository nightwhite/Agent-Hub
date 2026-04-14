package kube

import (
	"github.com/nightwhite/Agent-Hub/internal/agent"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
	intstrutil "k8s.io/apimachinery/pkg/util/intstr"
)

type ResourceObjects struct {
	Devbox  *unstructured.Unstructured
	Service *corev1.Service
	Ingress *networkingv1.Ingress
}

func Build(agentSpec agent.Agent, ingressDomain, image string) (ResourceObjects, error) {
	labels := Labels(agentSpec.Name)
	selectorLabels := managedSelectorLabels(agentSpec.Name)
	devboxAnnotations := cloneStringMap(Annotations(agentSpec.AliasName, agentSpec.ModelProvider, agentSpec.ModelBaseURL, agentSpec.Model))
	serviceAnnotations := cloneStringMap(devboxAnnotations)
	ingressAnnotations := cloneStringMap(devboxAnnotations)
	devboxLabels := cloneStringMap(labels)
	serviceLabels := cloneStringMap(labels)

	devboxObject := map[string]any{
		"apiVersion": "devbox.sealos.io/v1alpha2",
		"kind":       "Devbox",
		"metadata": map[string]any{
			"name":        agentSpec.Name,
			"namespace":   agentSpec.Namespace,
			"labels":      devboxLabels,
			"annotations": devboxAnnotations,
		},
		"spec": map[string]any{
			"image":            image,
			"state":            "Running",
			"runtimeClassName": "devbox-runtime",
			"storageLimit":     agentSpec.Storage,
			"network": map[string]any{
				"type": "SSHGate",
				"extraPorts": []any{map[string]any{
					"containerPort": 8642,
				}},
			},
			"resource": map[string]any{
				"cpu":    agentSpec.CPU,
				"memory": agentSpec.Memory,
			},
			"config": map[string]any{
				"labels":     stringMapToAnyMap(cloneStringMap(selectorLabels)),
				"user":       "node",
				"workingDir": "/opt/hermes",
				"appPorts": []any{map[string]any{
					"name":       agentSpec.Name,
					"port":       8642,
					"protocol":   "TCP",
					"targetPort": 8642,
				}},
				"env": []any{
					map[string]any{"name": "API_SERVER_KEY", "value": agentSpec.APIServerKey},
					map[string]any{"name": "API_SERVER_ENABLED", "value": "true"},
					map[string]any{"name": "API_SERVER_HOST", "value": "0.0.0.0"},
					map[string]any{"name": "API_SERVER_PORT", "value": "8642"},
					map[string]any{"name": "AGENT_MODEL_PROVIDER", "value": agentSpec.ModelProvider},
					map[string]any{"name": "AGENT_MODEL_BASEURL", "value": agentSpec.ModelBaseURL},
					map[string]any{"name": "AGENT_MODEL_APIKEY", "value": agentSpec.ModelAPIKey},
					map[string]any{"name": "AGENT_MODEL", "value": agentSpec.Model},
				},
				"args": []string{"gateway", "run"},
			},
		},
	}

	service := &corev1.Service{
		TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "Service"},
		ObjectMeta: metav1.ObjectMeta{
			Name:        agentSpec.Name,
			Namespace:   agentSpec.Namespace,
			Labels:      serviceLabels,
			Annotations: serviceAnnotations,
		},
		Spec: corev1.ServiceSpec{
			Selector: selectorLabels,
			Ports: []corev1.ServicePort{{
				Name:       "api",
				Port:       8642,
				TargetPort: intstrutil.FromInt(8642),
				Protocol:   corev1.ProtocolTCP,
			}},
		},
	}

	pathType := networkingv1.PathTypePrefix
	ingressLabels := cloneStringMap(labels)
	ingressLabels["cloud.sealos.io/app-deploy-manager"] = agentSpec.Name
	ingressLabels["cloud.sealos.io/app-deploy-manager-domain"] = ingressDomain
	ingress := &networkingv1.Ingress{
		TypeMeta: metav1.TypeMeta{APIVersion: "networking.k8s.io/v1", Kind: "Ingress"},
		ObjectMeta: metav1.ObjectMeta{
			Name:        agentSpec.Name,
			Namespace:   agentSpec.Namespace,
			Labels:      ingressLabels,
			Annotations: ingressAnnotations,
		},
		Spec: networkingv1.IngressSpec{
			IngressClassName: stringPtr("nginx"),
			Rules: []networkingv1.IngressRule{{
				Host: ingressDomain,
				IngressRuleValue: networkingv1.IngressRuleValue{
					HTTP: &networkingv1.HTTPIngressRuleValue{
						Paths: []networkingv1.HTTPIngressPath{{
							Path:     "/",
							PathType: &pathType,
							Backend: networkingv1.IngressBackend{
								Service: &networkingv1.IngressServiceBackend{
									Name: agentSpec.Name,
									Port: networkingv1.ServiceBackendPort{Number: 8642},
								},
							},
						}},
					},
				},
			}},
			TLS: []networkingv1.IngressTLS{{
				Hosts:      []string{ingressDomain},
				SecretName: "wildcard-cert",
			}},
		},
	}
	ingress.Annotations["nginx.ingress.kubernetes.io/proxy-body-size"] = "32m"
	ingress.Annotations["nginx.ingress.kubernetes.io/ssl-redirect"] = "false"
	ingress.Annotations["nginx.ingress.kubernetes.io/backend-protocol"] = "HTTP"
	ingress.Annotations["nginx.ingress.kubernetes.io/client-body-buffer-size"] = "64k"
	ingress.Annotations["nginx.ingress.kubernetes.io/proxy-buffer-size"] = "64k"
	ingress.Annotations["nginx.ingress.kubernetes.io/proxy-send-timeout"] = "300"
	ingress.Annotations["nginx.ingress.kubernetes.io/proxy-read-timeout"] = "300"
	ingress.Annotations["nginx.ingress.kubernetes.io/server-snippet"] = "client_header_buffer_size 64k;\nlarge_client_header_buffers 4 128k;"

	devbox := &unstructured.Unstructured{Object: devboxObject}

	return ResourceObjects{Devbox: devbox, Service: service, Ingress: ingress}, nil
}

func stringPtr(v string) *string {
	return &v
}

func SetOwnerReference(obj metav1.Object, owner *unstructured.Unstructured) {
	if obj == nil || owner == nil {
		return
	}

	trueValue := true
	obj.SetOwnerReferences([]metav1.OwnerReference{{
		APIVersion:         owner.GetAPIVersion(),
		Kind:               owner.GetKind(),
		Name:               owner.GetName(),
		UID:                types.UID(owner.GetUID()),
		Controller:         &trueValue,
		BlockOwnerDeletion: &trueValue,
	}})
}

func cloneStringMap(input map[string]string) map[string]string {
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func stringMapToAnyMap(input map[string]string) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func managedSelectorLabels(agentName string) map[string]string {
	return map[string]string{
		"agent.sealos.io/name": agentName,
	}
}
