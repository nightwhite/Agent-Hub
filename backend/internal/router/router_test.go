package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/config"
)

type testEnvelope struct {
	Code      int            `json:"code"`
	Message   string         `json:"message"`
	RequestID string         `json:"requestId"`
	Error     *testErrorBody `json:"error"`
	Data      map[string]any `json:"data"`
}

type testErrorBody struct {
	Type    string         `json:"type"`
	Details map[string]any `json:"details"`
}

func TestHealthzReturnsStandardEnvelope(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/healthz", "", "", map[string]string{
		"X-Request-Id": "req-healthz",
	})

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /healthz status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 0 {
		t.Fatalf("GET /healthz code = %d, want 0", body.Code)
	}
	if body.Message != "ok" {
		t.Fatalf("GET /healthz message = %q, want ok", body.Message)
	}
	if body.RequestID != "req-healthz" {
		t.Fatalf("GET /healthz requestId = %q, want req-healthz", body.RequestID)
	}
	if status := body.Data["status"]; status != "ok" {
		t.Fatalf("GET /healthz data.status = %#v, want ok", status)
	}
}

func TestReadyzReturnsStandardEnvelope(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/readyz", "", "", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /readyz status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 0 || body.Message != "ok" {
		t.Fatalf("GET /readyz envelope = %#v, want code=0 message=ok", body)
	}
	if status := body.Data["status"]; status != "ready" {
		t.Fatalf("GET /readyz data.status = %#v, want ready", status)
	}
}

func TestListAgentsRequiresAuthorization(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/api/v1/agents", "", "", nil)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("GET /api/v1/agents without Authorization status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 40010 {
		t.Fatalf("GET /api/v1/agents without Authorization code = %d, want 40010", body.Code)
	}
	if body.Error == nil || body.Error.Type != "missing_authorization" {
		t.Fatalf("GET /api/v1/agents without Authorization error = %#v, want missing_authorization", body.Error)
	}
	if body.Error.Details["header"] != "Authorization" {
		t.Fatalf("GET /api/v1/agents without Authorization error.details.header = %#v, want Authorization", body.Error.Details["header"])
	}
	if body.Error.Details["reason"] != "required" {
		t.Fatalf("GET /api/v1/agents without Authorization error.details.reason = %#v, want required", body.Error.Details["reason"])
	}
}

func TestListAgentsRejectsInvalidAuthorization(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/api/v1/agents", "", "", map[string]string{
		"Authorization": "%",
	})
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("GET /api/v1/agents invalid Authorization status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 40011 {
		t.Fatalf("GET /api/v1/agents invalid Authorization code = %d, want 40011", body.Code)
	}
	if body.Error == nil || body.Error.Type != "invalid_authorization" {
		t.Fatalf("GET /api/v1/agents invalid Authorization error = %#v, want invalid_authorization", body.Error)
	}
	if body.Error.Details["reason"] != "invalid_url_encoding" {
		t.Fatalf("GET /api/v1/agents invalid Authorization error.details.reason = %#v, want invalid_url_encoding", body.Error.Details["reason"])
	}
}

func TestCreateAgentRejectsInvalidJSONBeforeKubernetesCalls(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodPost, "/api/v1/agents", "{", "", map[string]string{
		"Authorization": validEncodedKubeconfig(),
		"Content-Type":  "application/json",
	})
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("POST /api/v1/agents invalid JSON status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 40000 {
		t.Fatalf("POST /api/v1/agents invalid JSON code = %d, want 40000", body.Code)
	}
	if body.Error == nil || body.Error.Type != "invalid_json" {
		t.Fatalf("POST /api/v1/agents invalid JSON error = %#v, want invalid_json", body.Error)
	}
}

func TestCreateAgentValidationErrorsUse422Envelope(t *testing.T) {
	t.Parallel()

	payload := `{
		"agent-name":"demo-agent",
		"agent-cpu":"1000m",
		"agent-memory":"2Gi",
		"agent-storage":"10Gi",
		"agent-model-provider":"openai",
		"agent-model-baseurl":"not-a-url",
		"agent-model":"gpt-4.1"
	}`

	recorder := performRequest(t, http.MethodPost, "/api/v1/agents", payload, "", map[string]string{
		"Authorization": validEncodedKubeconfig(),
		"Content-Type":  "application/json",
	})
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("POST /api/v1/agents invalid payload status = %d, want %d", recorder.Code, http.StatusUnprocessableEntity)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 42200 {
		t.Fatalf("POST /api/v1/agents invalid payload code = %d, want 42200", body.Code)
	}
	if body.Error == nil || body.Error.Type != "validation_failed" {
		t.Fatalf("POST /api/v1/agents invalid payload error = %#v, want validation_failed", body.Error)
	}
	if body.Error.Details["field"] != "agent-model-baseurl" {
		t.Fatalf("POST /api/v1/agents invalid payload error.details.field = %#v, want agent-model-baseurl", body.Error.Details["field"])
	}
	if body.Error.Details["reason"] != "invalid_url" {
		t.Fatalf("POST /api/v1/agents invalid payload error.details.reason = %#v, want invalid_url", body.Error.Details["reason"])
	}
}

func TestUpdateAgentOnlyAcceptsPatchRoute(t *testing.T) {
	t.Parallel()

	postRecorder := performRequest(t, http.MethodPost, "/api/v1/agents/demo-agent", "", "", nil)
	if postRecorder.Code != http.StatusNotFound {
		t.Fatalf("POST /api/v1/agents/:agentName status = %d, want %d", postRecorder.Code, http.StatusNotFound)
	}

	patchRecorder := performRequest(t, http.MethodPatch, "/api/v1/agents/demo-agent", "", "", nil)
	if patchRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("PATCH /api/v1/agents/:agentName status = %d, want %d", patchRecorder.Code, http.StatusUnauthorized)
	}
}

func TestPauseRouteReplacesStopRoute(t *testing.T) {
	t.Parallel()

	stopRecorder := performRequest(t, http.MethodPost, "/api/v1/agents/demo-agent/stop", "", "", nil)
	if stopRecorder.Code != http.StatusNotFound {
		t.Fatalf("POST /api/v1/agents/:agentName/stop status = %d, want %d", stopRecorder.Code, http.StatusNotFound)
	}

	pauseRecorder := performRequest(t, http.MethodPost, "/api/v1/agents/demo-agent/pause", "", "", nil)
	if pauseRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("POST /api/v1/agents/:agentName/pause status = %d, want %d", pauseRecorder.Code, http.StatusUnauthorized)
	}
}

func performRequest(t *testing.T, method, target, body, rawQuery string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()

	engine := New(config.Config{
		Port:           "8080",
		IngressSuffix:  "agent.usw-1.sealos.app",
		APIServerImage: "nousresearch/hermes-agent:latest",
	})

	if rawQuery != "" {
		target += "?" + rawQuery
	}
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)
	return recorder
}

func decodeEnvelope(t *testing.T, recorder *httptest.ResponseRecorder) testEnvelope {
	t.Helper()

	var envelope testEnvelope
	if err := jsonNewDecoder(recorder.Body.String(), &envelope); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return envelope
}

func validEncodedKubeconfig() string {
	raw := strings.TrimSpace(`
apiVersion: v1
kind: Config
current-context: test
clusters:
  - name: local
    cluster:
      server: https://127.0.0.1
contexts:
  - name: test
    context:
      cluster: local
      user: test-user
      namespace: ns-test
users:
  - name: test-user
    user:
      token: test-token
`)
	return url.QueryEscape(raw)
}

func jsonNewDecoder(raw string, target any) error {
	return json.Unmarshal([]byte(raw), target)
}
