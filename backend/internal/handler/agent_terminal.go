package handler

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"

	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

const (
	agentTerminalSessionTimeout = 25 * time.Second
	agentTerminalPollInterval   = 1 * time.Second
)

func CreateAgentTerminalSession(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}

	agentName := c.Param("agentName")
	if err := validateAgentName(agentName); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}

	if _, found := getManagedDevboxResource(ctx, factory.Namespace(), agentName, repo, c); !found {
		return
	}

	podRef, resolveErr := kube.ResolveAgentPod(ctx, clientset, factory.Namespace(), agentName)
	if resolveErr != nil {
		writeAppError(c, http.StatusConflict, appErr.New(appErr.CodeConflict, "agent pod is not ready for terminal access").WithDetails(map[string]any{
			"agentName":  agentName,
			"namespace":  factory.Namespace(),
			"reason":     resolveErr.Error(),
			"clusterURL": factory.ClusterServer(),
		}))
		return
	}

	currentAuth, authErr := kube.ParseCurrentAuthFromEncodedKubeconfig(strings.TrimSpace(c.GetHeader(kube.DefaultAuthorizationHeader)))
	if authErr != nil {
		writeHeaderKubeconfigError(c, appErr.New(appErr.CodeInvalidAuthorizationHeader, authErr.Error()).WithDetails(map[string]any{
			"header": kube.DefaultAuthorizationHeader,
			"reason": "invalid_kubeconfig",
		}))
		return
	}

	dynamicClient, clientErr := factory.Dynamic()
	if clientErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to build kubernetes dynamic client"))
		return
	}

	sessionCtx, cancel := context.WithTimeout(ctx, agentTerminalSessionTimeout)
	defer cancel()

	terminalName := kube.TerminalName(currentAuth.UserName)
	terminalStatus, ensureErr := ensureTerminalAccess(sessionCtx, dynamicClient, factory.Namespace(), terminalName, currentAuth)
	if ensureErr != nil {
		writeKubernetesError(c, ensureErr, "failed to prepare terminal service")
		return
	}

	iframeURL, iframeErr := buildTerminalIFrameURL(terminalStatus)
	if iframeErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, iframeErr.Error()))
		return
	}

	writeSuccess(c, http.StatusOK, dto.AgentTerminalSessionResponse{
		TerminalName:      terminalName,
		IFrameURL:         iframeURL,
		Namespace:         factory.Namespace(),
		PodName:           podRef.Name,
		ContainerName:     podRef.Container,
		Command:           buildTerminalExecCommand(factory.Namespace(), podRef),
		KeepaliveSeconds:  int((30 * time.Minute) / time.Second),
		AvailableReplicas: terminalStatus.AvailableReplicas,
	})
}

func ensureTerminalAccess(
	ctx context.Context,
	dynamicClient dynamic.Interface,
	namespace string,
	terminalName string,
	auth kube.CurrentAuth,
) (kube.TerminalStatus, error) {
	if err := applyTerminalResource(ctx, dynamicClient, namespace, terminalName, auth); err != nil {
		return kube.TerminalStatus{}, err
	}
	return waitForTerminalReady(ctx, dynamicClient, namespace, terminalName)
}

func applyTerminalResource(
	ctx context.Context,
	dynamicClient dynamic.Interface,
	namespace string,
	terminalName string,
	auth kube.CurrentAuth,
) error {
	resource := dynamicClient.Resource(kube.TerminalResourceGVR()).Namespace(namespace)
	existing, err := resource.Get(ctx, terminalName, metav1.GetOptions{})
	switch {
	case apierrors.IsNotFound(err):
		_, createErr := resource.Create(ctx, kube.BuildTerminalResource(terminalName, namespace, auth, time.Now()), metav1.CreateOptions{})
		return createErr
	case err != nil:
		return err
	}

	kube.RefreshTerminalResource(existing, auth, time.Now())
	_, err = resource.Update(ctx, existing, metav1.UpdateOptions{})
	return err
}

func waitForTerminalReady(
	ctx context.Context,
	dynamicClient dynamic.Interface,
	namespace string,
	terminalName string,
) (kube.TerminalStatus, error) {
	resource := dynamicClient.Resource(kube.TerminalResourceGVR()).Namespace(namespace)
	ticker := time.NewTicker(agentTerminalPollInterval)
	defer ticker.Stop()

	for {
		obj, err := resource.Get(ctx, terminalName, metav1.GetOptions{})
		if err != nil {
			return kube.TerminalStatus{}, err
		}

		status := kube.TerminalStatusFromResource(obj)
		if kube.TerminalReady(status) {
			return status, nil
		}

		select {
		case <-ctx.Done():
			return kube.TerminalStatus{}, fmt.Errorf("terminal service %s is not ready yet", terminalName)
		case <-ticker.C:
		}
	}
}

func buildTerminalIFrameURL(status kube.TerminalStatus) (string, error) {
	if !kube.TerminalReady(status) {
		return "", fmt.Errorf("terminal service is missing iframe access metadata")
	}

	parsed, err := url.Parse(strings.TrimSpace(status.Domain))
	if err != nil {
		return "", fmt.Errorf("invalid terminal domain")
	}
	if strings.TrimSpace(parsed.Scheme) == "" || strings.TrimSpace(parsed.Host) == "" {
		return "", fmt.Errorf("invalid terminal domain")
	}

	query := parsed.Query()
	query.Set("authorization", base64.StdEncoding.EncodeToString([]byte(status.SecretHeader)))
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func buildTerminalExecCommand(namespace string, pod kube.PodRef) string {
	return strings.Join([]string{
		"kubectl config set-context --current --namespace=" + shellSingleQuote(namespace),
		"clear",
		"(kubectl exec -it " + shellSingleQuote(pod.Name) + " -c " + shellSingleQuote(pod.Container) + " -- bash || kubectl exec -it " + shellSingleQuote(pod.Name) + " -c " + shellSingleQuote(pod.Container) + " -- sh)",
	}, " && ")
}

func shellSingleQuote(value string) string {
	return "'" + strings.ReplaceAll(strings.TrimSpace(value), "'", `'"'"'`) + "'"
}
