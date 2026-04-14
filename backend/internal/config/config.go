package config

import "os"

type Config struct {
	Port           string
	IngressSuffix  string
	APIServerImage string
}

func Load() Config {
	return Config{
		Port:           getenv("PORT", "8080"),
		IngressSuffix:  getenv("INGRESS_SUFFIX", "agent.usw-1.sealos.app"),
		APIServerImage: getenv("AGENT_IMAGE", "nousresearch/hermes-agent:latest"),
	}
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
