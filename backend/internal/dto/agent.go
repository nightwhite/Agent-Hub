package dto

type CreateAgentRequest struct {
	TemplateID     string `json:"template-id,omitempty"`
	AgentName      string `json:"agent-name" binding:"required"`
	AgentCPU       string `json:"agent-cpu" binding:"required"`
	AgentMemory    string `json:"agent-memory" binding:"required"`
	AgentStorage   string `json:"agent-storage" binding:"required"`
	ModelProvider  string `json:"agent-model-provider,omitempty"`
	ModelBaseURL   string `json:"agent-model-baseurl,omitempty"`
	ModelAPIKey    string `json:"agent-model-apikey,omitempty"`
	Model          string `json:"agent-model" binding:"required"`
	AgentAliasName string `json:"agent-alias-name,omitempty"`
}

type UpdateAgentRequest struct {
	AgentCPU       *string `json:"agent-cpu,omitempty"`
	AgentMemory    *string `json:"agent-memory,omitempty"`
	AgentStorage   *string `json:"agent-storage,omitempty"`
	ModelProvider  *string `json:"agent-model-provider,omitempty"`
	ModelBaseURL   *string `json:"agent-model-baseurl,omitempty"`
	ModelAPIKey    *string `json:"agent-model-apikey,omitempty"`
	Model          *string `json:"agent-model,omitempty"`
	AgentAliasName *string `json:"agent-alias-name,omitempty"`
}

type AgentItem struct {
	AgentName        string `json:"agentName"`
	TemplateID       string `json:"templateId,omitempty"`
	AliasName        string `json:"aliasName,omitempty"`
	Namespace        string `json:"namespace"`
	Status           string `json:"status"`
	CPU              string `json:"cpu"`
	Memory           string `json:"memory"`
	Storage          string `json:"storage"`
	WorkingDir       string `json:"workingDir,omitempty"`
	ModelProvider    string `json:"modelProvider"`
	ModelBaseURL     string `json:"modelBaseURL"`
	Model            string `json:"model"`
	HasModelAPIKey   bool   `json:"hasModelAPIKey"`
	IngressDomain    string `json:"ingressDomain,omitempty"`
	APIBaseURL       string `json:"apiBaseURL,omitempty"`
	Ready            bool   `json:"ready"`
	BootstrapPhase   string `json:"bootstrapPhase,omitempty"`
	BootstrapMessage string `json:"bootstrapMessage,omitempty"`
	CreatedAt        string `json:"createdAt,omitempty"`
}

type AgentListResponse struct {
	Items []AgentItem    `json:"items"`
	Total int            `json:"total"`
	Meta  map[string]any `json:"meta,omitempty"`
}

type AgentDetailResponse struct {
	Agent AgentItem `json:"agent"`
}

type CreateAgentResponse struct {
	Agent AgentItem `json:"agent"`
}

type AgentKeyRotateResponse struct {
	AgentName string `json:"agentName"`
	Rotated   bool   `json:"rotated"`
}
