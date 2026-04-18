package config

import (
	"os"
	"strings"
)

type Config struct {
	Port                string
	IngressSuffix       string
	SSHDomain           string
	APIServerImage      string
	AgentTemplateDir    string
	WebDistDir          string
	AIProxyBaseURL      string
	AIProxyModelBaseURL string
	Region              string
	WSAllowedOrigins    string
}

func Load() Config {
	loadDotEnv()

	aiProxyManagerBaseURL := normalizeAIProxyManagerBaseURL(strings.TrimSpace(os.Getenv("AIPROXY_MANAGER_BASE_URL")))
	if aiProxyManagerBaseURL == "" {
		aiProxyManagerBaseURL = normalizeAIProxyManagerBaseURL(strings.TrimSpace(os.Getenv("AIPROXY_BASE_URL")))
	}

	return Config{
		Port:                getenv("PORT", "8999"),
		IngressSuffix:       getenv("INGRESS_SUFFIX", "agent.usw-1.sealos.app"),
		SSHDomain:           strings.TrimSpace(os.Getenv("SSH_DOMAIN")),
		APIServerImage:      getenv("AGENT_IMAGE", "nousresearch/hermes-agent:latest"),
		AgentTemplateDir:    getenv("AGENT_MANIFEST_TEMPLATE_DIR", ""),
		WebDistDir:          getenv("WEB_DIST_DIR", ""),
		AIProxyBaseURL:      aiProxyManagerBaseURL,
		AIProxyModelBaseURL: strings.TrimSpace(os.Getenv("AIPROXY_MODEL_BASE_URL")),
		Region:              resolveRegion(),
		WSAllowedOrigins:    getenv("WS_ALLOWED_ORIGINS", ""),
	}
}

func normalizeAIProxyManagerBaseURL(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return strings.Replace(trimmed, ".sealos.app", ".sealos.io", 1)
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func resolveRegion() string {
	return normalizeRegion(strings.TrimSpace(os.Getenv("REGION")))
}

func normalizeRegion(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "cn":
		return "cn"
	case "us":
		return "us"
	default:
		return ""
	}
}

func loadDotEnv() {
	raw, err := os.ReadFile(".env")
	if err != nil {
		return
	}

	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if existing, exists := os.LookupEnv(key); exists && strings.TrimSpace(existing) != "" {
			continue
		}

		value = strings.TrimSpace(value)
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}

		_ = os.Setenv(key, value)
	}
}
