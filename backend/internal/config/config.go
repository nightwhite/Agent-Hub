package config

import (
	"os"
	"strings"
)

type Config struct {
	Port                string
	IngressSuffix       string
	APIServerImage      string
	AgentTemplateDir    string
	AIProxyBaseURL      string
	AIProxyModelBaseURL string
	WSAllowedOrigins    string
}

func Load() Config {
	aiProxyManagerBaseURL := strings.TrimSpace(os.Getenv("AIPROXY_MANAGER_BASE_URL"))
	if aiProxyManagerBaseURL == "" {
		aiProxyManagerBaseURL = strings.TrimSpace(os.Getenv("AIPROXY_BASE_URL"))
	}

	return Config{
		Port:                getenv("PORT", "8999"),
		IngressSuffix:       getenv("INGRESS_SUFFIX", "agent.usw-1.sealos.app"),
		APIServerImage:      getenv("AGENT_IMAGE", "nousresearch/hermes-agent:latest"),
		AgentTemplateDir:    getenv("AGENT_MANIFEST_TEMPLATE_DIR", ""),
		AIProxyBaseURL:      aiProxyManagerBaseURL,
		AIProxyModelBaseURL: strings.TrimSpace(os.Getenv("AIPROXY_MODEL_BASE_URL")),
		WSAllowedOrigins:    getenv("WS_ALLOWED_ORIGINS", ""),
	}
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
