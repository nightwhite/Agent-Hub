package handler

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	kubernetes "k8s.io/client-go/kubernetes"
	"k8s.io/client-go/util/retry"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	"github.com/nightwhite/Agent-Hub/internal/random"
	agentws "github.com/nightwhite/Agent-Hub/internal/ws"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func ListAgents(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}

	devboxes, kErr := repo.List(ctx, "app.kubernetes.io/name=hermes-agent")
	if kErr != nil {
		writeKubernetesError(c, kErr, "failed to list agents")
		return
	}

	views := make([]kube.AgentView, 0, len(devboxes.Items))
	for i := range devboxes.Items {
		item := devboxes.Items[i]
		if !kube.HasManagedLabel(item.GetLabels(), item.GetName()) {
			continue
		}
		view, convErr := kube.DevboxToAgentView(&item)
		if convErr != nil {
			writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, convErr.Error()))
			return
		}
		enrichAgentRuntimeStatus(ctx, clientset, &item, &view)
		enrichIngressDomain(ctx, clientset, &view)
		views = append(views, view)
	}
	sort.Slice(views, func(i, j int) bool { return views[i].CreatedAt > views[j].CreatedAt })

	items := make([]dto.AgentItem, 0, len(views))
	for _, view := range views {
		items = append(items, toAgentItem(view))
	}

	writeSuccess(c, http.StatusOK, dto.AgentListResponse{
		Items: items,
		Total: len(items),
		Meta:  map[string]any{"namespace": factory.Namespace()},
	})
}

func CreateAgent(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}

	var req dto.CreateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeAppError(c, http.StatusBadRequest, appErr.ErrInvalidJSON)
		return
	}
	if err := validateCreateRequest(req); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}
	if _, err := repo.Get(ctx, req.AgentName); err == nil {
		writeAppError(c, http.StatusConflict, appErr.New(appErr.CodeConflict, "agent already exists"))
		return
	} else if !apierrors.IsNotFound(err) {
		writeKubernetesError(c, err, "failed to check existing agent")
		return
	}

	apiServerKey, genErr := random.String(64)
	if genErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to generate api server key"))
		return
	}
	domainPrefix, genErr := random.String(12)
	if genErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to generate ingress domain"))
		return
	}

	cfg := runtimeConfig(c)
	ingressDomain := domainPrefix + "-" + strings.TrimSpace(cfg.IngressSuffix)
	ag := agent.Agent{
		Name:          strings.TrimSpace(req.AgentName),
		AliasName:     strings.TrimSpace(req.AgentAliasName),
		Namespace:     factory.Namespace(),
		CPU:           strings.TrimSpace(req.AgentCPU),
		Memory:        strings.TrimSpace(req.AgentMemory),
		Storage:       strings.TrimSpace(req.AgentStorage),
		ModelProvider: strings.TrimSpace(req.ModelProvider),
		ModelBaseURL:  strings.TrimSpace(req.ModelBaseURL),
		ModelAPIKey:   req.ModelAPIKey,
		Model:         strings.TrimSpace(req.Model),
		APIServerKey:  apiServerKey,
		IngressDomain: ingressDomain,
		Status:        agent.StatusRunning,
	}

	objects, buildErr := kube.Build(ag, kube.BuildOptions{
		IngressDomain: ingressDomain,
		Image:         cfg.APIServerImage,
		TemplateDir:   cfg.AgentTemplateDir,
	})
	if buildErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to build kubernetes resources"))
		return
	}

	createdDevbox, kErr := repo.Create(ctx, objects.Devbox)
	if kErr != nil {
		writeKubernetesError(c, kErr, "failed to create devbox")
		return
	}
	if _, err := clientset.CoreV1().Services(factory.Namespace()).Create(ctx, objects.Service, metav1.CreateOptions{}); err != nil {
		_ = repo.Delete(ctx, createdDevbox.GetName())
		writeKubernetesError(c, err, "failed to create service")
		return
	}
	createdIngress, kErr := clientset.NetworkingV1().Ingresses(factory.Namespace()).Create(ctx, objects.Ingress, metav1.CreateOptions{})
	if kErr != nil {
		_ = clientset.CoreV1().Services(factory.Namespace()).Delete(ctx, objects.Service.Name, metav1.DeleteOptions{})
		_ = repo.Delete(ctx, createdDevbox.GetName())
		writeKubernetesError(c, kErr, "failed to create ingress")
		return
	}

	view, convErr := kube.DevboxToAgentView(createdDevbox)
	if convErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, convErr.Error()))
		return
	}
	enrichAgentRuntimeStatus(ctx, clientset, createdDevbox, &view)
	view.Agent.IngressDomain = kube.IngressDomain(createdIngress)

	writeSuccess(c, http.StatusCreated, dto.CreateAgentResponse{
		Agent: toAgentItem(view),
	})
}

func GetAgent(c *gin.Context) {
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
	view, found := getAgentView(ctx, factory.Namespace(), agentName, repo, clientset, c)
	if !found {
		return
	}

	writeSuccess(c, http.StatusOK, dto.AgentDetailResponse{Agent: toAgentItem(view)})
}

func UpdateAgent(c *gin.Context) {
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

	var req dto.UpdateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeAppError(c, http.StatusBadRequest, appErr.ErrInvalidJSON)
		return
	}
	if err := validateUpdateRequest(req); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}
	updatedDevbox, updatedIngress, updateErr := updateAgentResources(ctx, repo, clientset, factory.Namespace(), agentName, req)
	if updateErr != nil {
		writeKubernetesError(c, updateErr, "failed to update agent resources")
		return
	}

	view, convErr := kube.DevboxToAgentView(updatedDevbox)
	if convErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, convErr.Error()))
		return
	}
	enrichAgentRuntimeStatus(ctx, clientset, updatedDevbox, &view)
	view.Agent.IngressDomain = kube.IngressDomain(updatedIngress)

	writeSuccess(c, http.StatusOK, dto.AgentDetailResponse{Agent: toAgentItem(view)})
}

func retryUpdateDevbox(ctx context.Context, repo *kube.Repository, agentName string, req dto.UpdateAgentRequest) (*unstructured.Unstructured, error) {
	var updated *unstructured.Unstructured
	err := retry.RetryOnConflict(retry.DefaultRetry, func() error {
		devbox, getErr := repo.Get(ctx, agentName)
		if getErr != nil {
			return getErr
		}
		if !kube.HasManagedLabel(devbox.GetLabels(), agentName) {
			return apierrors.NewNotFound(kube.ResourceGVR().GroupResource(), agentName)
		}

		applyUpdateToDevbox(devbox, req)
		next, updateErr := repo.Update(ctx, devbox)
		if updateErr != nil {
			return updateErr
		}
		updated = next
		return nil
	})
	return updated, err
}

func retryUpdateService(ctx context.Context, clientset kubernetes.Interface, namespace, agentName string, req dto.UpdateAgentRequest) error {
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		service, err := clientset.CoreV1().Services(namespace).Get(ctx, agentName, metav1.GetOptions{})
		if err != nil {
			return err
		}
		applyUpdateToService(service, req)
		_, err = clientset.CoreV1().Services(namespace).Update(ctx, service, metav1.UpdateOptions{})
		return err
	})
}

func retryUpdateIngress(ctx context.Context, clientset kubernetes.Interface, namespace, agentName string, req dto.UpdateAgentRequest) (*networkingv1.Ingress, error) {
	var updated *networkingv1.Ingress
	err := retry.RetryOnConflict(retry.DefaultRetry, func() error {
		ingress, err := clientset.NetworkingV1().Ingresses(namespace).Get(ctx, agentName, metav1.GetOptions{})
		if err != nil {
			return err
		}
		applyUpdateToIngress(ingress, req)
		next, updateErr := clientset.NetworkingV1().Ingresses(namespace).Update(ctx, ingress, metav1.UpdateOptions{})
		if updateErr != nil {
			return updateErr
		}
		updated = next
		return nil
	})
	return updated, err
}

func updateAgentResources(
	ctx context.Context,
	repo *kube.Repository,
	clientset kubernetes.Interface,
	namespace string,
	agentName string,
	req dto.UpdateAgentRequest,
) (*unstructured.Unstructured, *networkingv1.Ingress, error) {
	devbox, service, _, err := getManagedResources(ctx, namespace, agentName, repo, clientset)
	if err != nil {
		return nil, nil, err
	}

	devboxSnapshot := devbox.DeepCopy()
	serviceSnapshot := service.DeepCopy()

	updatedDevbox, err := retryUpdateDevbox(ctx, repo, agentName, req)
	if err != nil {
		return nil, nil, err
	}
	if err := retryUpdateService(ctx, clientset, namespace, agentName, req); err != nil {
		return nil, nil, combineRollbackError(err, restoreDevbox(ctx, repo, devboxSnapshot))
	}

	updatedIngress, err := retryUpdateIngress(ctx, clientset, namespace, agentName, req)
	if err != nil {
		return nil, nil, combineRollbackError(
			err,
			restoreService(ctx, clientset, namespace, serviceSnapshot),
			restoreDevbox(ctx, repo, devboxSnapshot),
		)
	}

	return updatedDevbox, updatedIngress, nil
}

func restoreDevbox(ctx context.Context, repo *kube.Repository, snapshot *unstructured.Unstructured) error {
	if snapshot == nil {
		return nil
	}

	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		current, err := repo.Get(ctx, snapshot.GetName())
		if err != nil {
			return err
		}

		restore := snapshot.DeepCopy()
		restore.SetResourceVersion(current.GetResourceVersion())
		_, err = repo.Update(ctx, restore)
		return err
	})
}

func restoreService(ctx context.Context, clientset kubernetes.Interface, namespace string, snapshot *corev1.Service) error {
	if snapshot == nil {
		return nil
	}

	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		current, err := clientset.CoreV1().Services(namespace).Get(ctx, snapshot.Name, metav1.GetOptions{})
		if err != nil {
			return err
		}

		restore := snapshot.DeepCopy()
		restore.ResourceVersion = current.ResourceVersion
		_, err = clientset.CoreV1().Services(namespace).Update(ctx, restore, metav1.UpdateOptions{})
		return err
	})
}

func combineRollbackError(primary error, rollbackErrors ...error) error {
	failures := make([]string, 0, len(rollbackErrors))
	for _, err := range rollbackErrors {
		if err == nil {
			continue
		}
		failures = append(failures, err.Error())
	}
	if len(failures) == 0 {
		return primary
	}

	return fmt.Errorf("%w; rollback failed: %s", primary, strings.Join(failures, "; "))
}

func DeleteAgent(c *gin.Context) {
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
	devbox, svc, ing, found := getResources(ctx, factory.Namespace(), agentName, repo, clientset, c)
	if !found {
		return
	}

	if err := clientset.NetworkingV1().Ingresses(factory.Namespace()).Delete(ctx, ing.Name, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
		writeKubernetesError(c, err, "failed to delete ingress")
		return
	}
	if err := clientset.CoreV1().Services(factory.Namespace()).Delete(ctx, svc.Name, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
		writeKubernetesError(c, err, "failed to delete service")
		return
	}
	if err := repo.Delete(ctx, devbox.GetName()); err != nil && !apierrors.IsNotFound(err) {
		writeKubernetesError(c, err, "failed to delete devbox")
		return
	}

	writeSuccess(c, http.StatusOK, gin.H{
		"agentName": agentName,
		"deleted":   true,
	})
}

func RunAgent(c *gin.Context) {
	changeAgentState(c, "Running")
}

func PauseAgent(c *gin.Context) {
	changeAgentState(c, "Paused")
}

func GetAgentKey(c *gin.Context) {
	writeAppError(c, http.StatusNotImplemented, appErr.New(appErr.CodeNotImplemented, "agent key readback is disabled").WithDetails(map[string]any{
		"endpoint": "agent_key_read",
		"reason":   "sensitive_key_readback_disabled",
	}))
}

func RotateAgentKey(c *gin.Context) {
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
	devbox, _, _, found := getResources(ctx, factory.Namespace(), agentName, repo, clientset, c)
	if !found {
		return
	}

	newKey, genErr := random.String(64)
	if genErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to generate api server key"))
		return
	}
	if err := kube.SetEnvValue(devbox, "API_SERVER_KEY", newKey); err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to update api server key env"))
		return
	}
	if _, err := repo.Update(ctx, devbox); err != nil {
		writeKubernetesError(c, err, "failed to rotate api server key")
		return
	}

	writeSuccess(c, http.StatusOK, dto.AgentKeyRotateResponse{AgentName: agentName, Rotated: true})
}

func ChatCompletions(c *gin.Context) {
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

	view, found := getAgentView(ctx, factory.Namespace(), agentName, repo, clientset, c)
	if !found {
		return
	}

	apiBaseURL := strings.TrimSpace(kube.APIBaseURL(view.Agent.IngressDomain))
	if apiBaseURL == "" {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "agent ingress domain is unavailable"))
		return
	}

	apiServerKey := strings.TrimSpace(view.Agent.APIServerKey)
	if apiServerKey == "" {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "agent api server key is unavailable"))
		return
	}

	upstreamURL := strings.TrimRight(apiBaseURL, "/") + "/chat/completions"
	req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, upstreamURL, c.Request.Body)
	if reqErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to build chat proxy request"))
		return
	}

	contentType := strings.TrimSpace(c.GetHeader("Content-Type"))
	if contentType == "" {
		contentType = "application/json"
	}
	req.Header.Set("Content-Type", contentType)

	accept := strings.TrimSpace(c.GetHeader("Accept"))
	if accept == "" {
		accept = "application/json, text/event-stream"
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("Authorization", "Bearer "+apiServerKey)
	req.Header.Set("X-API-Key", apiServerKey)

	upstreamResp, upstreamErr := (&http.Client{}).Do(req)
	if upstreamErr != nil {
		writeAppError(c, http.StatusBadGateway, appErr.New(appErr.CodeKubernetesOperation, "failed to proxy chat request"))
		return
	}
	defer upstreamResp.Body.Close()

	if headerValue := upstreamResp.Header.Get("Content-Type"); headerValue != "" {
		c.Header("Content-Type", headerValue)
	}
	if headerValue := upstreamResp.Header.Get("Cache-Control"); headerValue != "" {
		c.Header("Cache-Control", headerValue)
	}
	if headerValue := upstreamResp.Header.Get("X-Accel-Buffering"); headerValue != "" {
		c.Header("X-Accel-Buffering", headerValue)
	} else {
		c.Header("X-Accel-Buffering", "no")
	}

	c.Status(upstreamResp.StatusCode)
	flusher, _ := c.Writer.(http.Flusher)
	buffer := make([]byte, 32*1024)

	for {
		n, readErr := upstreamResp.Body.Read(buffer)
		if n > 0 {
			if _, writeErr := c.Writer.Write(buffer[:n]); writeErr != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
		}

		if readErr == nil {
			continue
		}
		if readErr == io.EOF {
			return
		}
		return
	}
}

func AgentWebSocket(c *gin.Context) {
	agentws.Handler{Config: runtimeConfig(c)}.Serve(c, requestID(c))
}

func newClients(c *gin.Context, factory *kube.Factory) (*kube.Repository, kubernetes.Interface, bool) {
	dynamicClient, err := factory.Dynamic()
	if err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to build kubernetes dynamic client"))
		return nil, nil, false
	}
	clientset, err := factory.Kubernetes()
	if err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to build kubernetes clientset"))
		return nil, nil, false
	}
	return kube.NewRepository(dynamicClient, factory.Namespace()), clientset, true
}

func getAgentView(ctx context.Context, namespace, agentName string, repo *kube.Repository, clientset kubernetes.Interface, c *gin.Context) (kube.AgentView, bool) {
	devbox, svc, ing, found := getResources(ctx, namespace, agentName, repo, clientset, c)
	if !found {
		return kube.AgentView{}, false
	}
	_ = svc
	view, err := kube.DevboxToAgentView(devbox)
	if err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, err.Error()))
		return kube.AgentView{}, false
	}
	enrichAgentRuntimeStatus(ctx, clientset, devbox, &view)
	view.Agent.IngressDomain = kube.IngressDomain(ing)
	return view, true
}

func getResources(ctx context.Context, namespace, agentName string, repo *kube.Repository, clientset kubernetes.Interface, c *gin.Context) (*unstructured.Unstructured, *corev1.Service, *networkingv1.Ingress, bool) {
	devbox, svc, ing, err := getManagedResources(ctx, namespace, agentName, repo, clientset)
	if err == nil {
		return devbox, svc, ing, true
	}

	switch {
	case apierrors.IsNotFound(err):
		resource := strings.TrimSpace(err.Error())
		switch {
		case strings.Contains(resource, "services"):
			writeKubernetesError(c, err, "service not found for agent")
		case strings.Contains(resource, "ingresses"):
			writeKubernetesError(c, err, "ingress not found for agent")
		default:
			writeKubernetesError(c, err, "agent not found")
		}
	default:
		writeKubernetesError(c, err, "agent not found")
	}

	return nil, nil, nil, false
}

func getManagedResources(ctx context.Context, namespace, agentName string, repo *kube.Repository, clientset kubernetes.Interface) (*unstructured.Unstructured, *corev1.Service, *networkingv1.Ingress, error) {
	devbox, err := repo.Get(ctx, agentName)
	if err != nil {
		return nil, nil, nil, err
	}
	if !kube.HasManagedLabel(devbox.GetLabels(), agentName) {
		return nil, nil, nil, apierrors.NewNotFound(kube.ResourceGVR().GroupResource(), agentName)
	}

	svc, err := clientset.CoreV1().Services(namespace).Get(ctx, agentName, metav1.GetOptions{})
	if err != nil {
		return nil, nil, nil, err
	}

	ing, err := clientset.NetworkingV1().Ingresses(namespace).Get(ctx, agentName, metav1.GetOptions{})
	if err != nil {
		return nil, nil, nil, err
	}

	return devbox, svc, ing, nil
}

func enrichIngressDomain(ctx context.Context, clientset kubernetes.Interface, view *kube.AgentView) {
	ing, err := clientset.NetworkingV1().Ingresses(view.Agent.Namespace).Get(ctx, view.Agent.Name, metav1.GetOptions{})
	if err == nil {
		view.Agent.IngressDomain = kube.IngressDomain(ing)
		return
	}

	log.Printf("failed to load ingress for agent %s/%s: %v", view.Agent.Namespace, view.Agent.Name, err)
}

func toAgentItem(view kube.AgentView) dto.AgentItem {
	return dto.AgentItem{
		AgentName:      view.Agent.Name,
		AliasName:      view.Agent.AliasName,
		Namespace:      view.Agent.Namespace,
		Status:         string(view.Agent.Status),
		CPU:            view.Agent.CPU,
		Memory:         view.Agent.Memory,
		Storage:        view.Agent.Storage,
		ModelProvider:  view.Agent.ModelProvider,
		ModelBaseURL:   view.Agent.ModelBaseURL,
		Model:          view.Agent.Model,
		HasModelAPIKey: strings.TrimSpace(view.Agent.ModelAPIKey) != "",
		IngressDomain:  view.Agent.IngressDomain,
		APIBaseURL:     kube.APIBaseURL(view.Agent.IngressDomain),
		CreatedAt:      view.CreatedAt,
	}
}

func validateCreateRequest(req dto.CreateAgentRequest) *appErr.AppError {
	if err := validateAgentName(req.AgentName); err != nil {
		return err
	}
	if err := validateQuantity("agent-cpu", req.AgentCPU); err != nil {
		return err
	}
	if err := validateQuantity("agent-memory", req.AgentMemory); err != nil {
		return err
	}
	if err := validateQuantity("agent-storage", req.AgentStorage); err != nil {
		return err
	}
	if strings.TrimSpace(req.ModelProvider) == "" {
		return validationFieldError("agent-model-provider", "required", "")
	}
	if strings.TrimSpace(req.Model) == "" {
		return validationFieldError("agent-model", "required", "")
	}
	return validateModelBaseURL(req.ModelBaseURL)
}

func validateUpdateRequest(req dto.UpdateAgentRequest) *appErr.AppError {
	if req.AgentCPU != nil {
		if err := validateQuantity("agent-cpu", *req.AgentCPU); err != nil {
			return err
		}
	}
	if req.AgentMemory != nil {
		if err := validateQuantity("agent-memory", *req.AgentMemory); err != nil {
			return err
		}
	}
	if req.AgentStorage != nil {
		if err := validateQuantity("agent-storage", *req.AgentStorage); err != nil {
			return err
		}
	}
	if req.ModelBaseURL != nil {
		if err := validateModelBaseURL(*req.ModelBaseURL); err != nil {
			return err
		}
	}
	if req.ModelProvider != nil && strings.TrimSpace(*req.ModelProvider) == "" {
		return validationFieldError("agent-model-provider", "cannot_be_empty", *req.ModelProvider)
	}
	if req.Model != nil && strings.TrimSpace(*req.Model) == "" {
		return validationFieldError("agent-model", "cannot_be_empty", *req.Model)
	}
	return nil
}

func validateAgentName(name string) *appErr.AppError {
	if !agent.ValidateName(strings.TrimSpace(name)) {
		return appErr.New(appErr.CodeInvalidAgentName, "invalid agent name").WithDetails(map[string]any{
			"field":  "agentName",
			"reason": "invalid_format",
			"value":  strings.TrimSpace(name),
		})
	}
	return nil
}

func validateQuantity(field, value string) *appErr.AppError {
	if strings.TrimSpace(value) == "" {
		return validationFieldError(field, "required", value)
	}
	if _, err := resource.ParseQuantity(strings.TrimSpace(value)); err != nil {
		return validationFieldError(field, "invalid_quantity", value)
	}
	return nil
}

func validateModelBaseURL(value string) *appErr.AppError {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return validationFieldError("agent-model-baseurl", "invalid_url", value)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return validationFieldError("agent-model-baseurl", "unsupported_scheme", value)
	}
	return nil
}

func validationFieldError(field, reason, value string) *appErr.AppError {
	message := field + " is invalid"
	switch reason {
	case "required":
		message = field + " is required"
	case "cannot_be_empty":
		message = field + " cannot be empty"
	case "invalid_quantity":
		message = field + " is invalid"
	case "invalid_url":
		message = field + " is invalid"
	case "unsupported_scheme":
		message = field + " must start with http or https"
	}

	return appErr.New(appErr.CodeValidationFailed, message).WithDetails(map[string]any{
		"field":  field,
		"reason": reason,
		"value":  value,
	})
}

func applyUpdateToDevbox(devbox *unstructured.Unstructured, req dto.UpdateAgentRequest) {
	if req.AgentCPU != nil {
		_ = unstructured.SetNestedField(devbox.Object, strings.TrimSpace(*req.AgentCPU), "spec", "resource", "cpu")
	}
	if req.AgentMemory != nil {
		_ = unstructured.SetNestedField(devbox.Object, strings.TrimSpace(*req.AgentMemory), "spec", "resource", "memory")
	}
	if req.AgentStorage != nil {
		_ = unstructured.SetNestedField(devbox.Object, strings.TrimSpace(*req.AgentStorage), "spec", "storageLimit")
	}
	if req.AgentAliasName != nil {
		_ = kube.SetAnnotation(devbox, "agent.sealos.io/alias-name", strings.TrimSpace(*req.AgentAliasName))
	}
	if req.ModelProvider != nil {
		_ = kube.SetAnnotation(devbox, "agent.sealos.io/model-provider", strings.TrimSpace(*req.ModelProvider))
		_ = kube.SetEnvValue(devbox, "AGENT_MODEL_PROVIDER", strings.TrimSpace(*req.ModelProvider))
	}
	if req.ModelBaseURL != nil {
		_ = kube.SetAnnotation(devbox, "agent.sealos.io/model-baseurl", strings.TrimSpace(*req.ModelBaseURL))
		_ = kube.SetEnvValue(devbox, "AGENT_MODEL_BASEURL", strings.TrimSpace(*req.ModelBaseURL))
	}
	if req.Model != nil {
		_ = kube.SetAnnotation(devbox, "agent.sealos.io/model", strings.TrimSpace(*req.Model))
		_ = kube.SetEnvValue(devbox, "AGENT_MODEL", strings.TrimSpace(*req.Model))
	}
	if req.ModelAPIKey != nil {
		_ = kube.SetEnvValue(devbox, "AGENT_MODEL_APIKEY", *req.ModelAPIKey)
	}
}

func applyUpdateToService(service *corev1.Service, req dto.UpdateAgentRequest) {
	if service.Annotations == nil {
		service.Annotations = map[string]string{}
	}
	if req.AgentAliasName != nil {
		alias := strings.TrimSpace(*req.AgentAliasName)
		if alias == "" {
			delete(service.Annotations, "agent.sealos.io/alias-name")
		} else {
			service.Annotations["agent.sealos.io/alias-name"] = alias
		}
	}
	if req.ModelProvider != nil {
		service.Annotations["agent.sealos.io/model-provider"] = strings.TrimSpace(*req.ModelProvider)
	}
	if req.ModelBaseURL != nil {
		service.Annotations["agent.sealos.io/model-baseurl"] = strings.TrimSpace(*req.ModelBaseURL)
	}
	if req.Model != nil {
		service.Annotations["agent.sealos.io/model"] = strings.TrimSpace(*req.Model)
	}
}

func applyUpdateToIngress(ingress *networkingv1.Ingress, req dto.UpdateAgentRequest) {
	if ingress.Annotations == nil {
		ingress.Annotations = map[string]string{}
	}
	if req.AgentAliasName != nil {
		alias := strings.TrimSpace(*req.AgentAliasName)
		if alias == "" {
			delete(ingress.Annotations, "agent.sealos.io/alias-name")
		} else {
			ingress.Annotations["agent.sealos.io/alias-name"] = alias
		}
	}
	if req.ModelProvider != nil {
		ingress.Annotations["agent.sealos.io/model-provider"] = strings.TrimSpace(*req.ModelProvider)
	}
	if req.ModelBaseURL != nil {
		ingress.Annotations["agent.sealos.io/model-baseurl"] = strings.TrimSpace(*req.ModelBaseURL)
	}
	if req.Model != nil {
		ingress.Annotations["agent.sealos.io/model"] = strings.TrimSpace(*req.Model)
	}
}

func changeAgentState(c *gin.Context, targetState string) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}
	if targetState != string(agent.StatusRunning) && targetState != string(agent.StatusPaused) {
		writeAppError(c, http.StatusBadRequest, appErr.New(appErr.CodeInvalidAgentState, "invalid agent state").WithDetails(map[string]any{
			"field":  "state",
			"reason": "unsupported_state",
			"value":  targetState,
		}))
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
	devbox, _, _, found := getResources(ctx, factory.Namespace(), agentName, repo, clientset, c)
	if !found {
		return
	}
	if err := unstructured.SetNestedField(devbox.Object, targetState, "spec", "state"); err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to set agent state"))
		return
	}
	updated, kErr := repo.Update(ctx, devbox)
	if kErr != nil {
		writeKubernetesError(c, kErr, "failed to update agent state")
		return
	}
	view, convErr := kube.DevboxToAgentView(updated)
	if convErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, convErr.Error()))
		return
	}
	enrichAgentRuntimeStatus(ctx, clientset, updated, &view)
	enrichIngressDomain(ctx, clientset, &view)

	writeSuccess(c, http.StatusOK, dto.AgentDetailResponse{Agent: toAgentItem(view)})
}
