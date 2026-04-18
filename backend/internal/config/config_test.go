package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadPrefersRegionEnv(t *testing.T) {
	t.Setenv("REGION", "cn")

	cfg := Load()
	if cfg.Region != "cn" {
		t.Fatalf("Load().Region = %q, want cn", cfg.Region)
	}
}

func TestLoadInvalidRegionClearsValue(t *testing.T) {
	t.Setenv("REGION", "hzh")

	cfg := Load()
	if cfg.Region != "" {
		t.Fatalf("Load().Region = %q, want empty", cfg.Region)
	}
}

func TestLoadMissingRegionKeepsEmpty(t *testing.T) {
	t.Setenv("REGION", "")

	cfg := Load()
	if cfg.Region != "" {
		t.Fatalf("Load().Region = %q, want empty", cfg.Region)
	}
}

func TestLoadReadsRegionFromDotEnvInCurrentDir(t *testing.T) {
	t.Setenv("REGION", "")

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}

	tempDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(tempDir, ".env"), []byte("REGION=us\nPORT=9777\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(.env) error = %v", err)
	}
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("Chdir(tempDir) error = %v", err)
	}
	defer func() {
		_ = os.Chdir(cwd)
	}()

	cfg := Load()
	if cfg.Region != "us" {
		t.Fatalf("Load().Region = %q, want us from .env", cfg.Region)
	}
	if cfg.Port != "9777" {
		t.Fatalf("Load().Port = %q, want 9777 from .env", cfg.Port)
	}
}

func TestLoadPrefersProcessEnvOverDotEnv(t *testing.T) {
	t.Setenv("REGION", "cn")

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}

	tempDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(tempDir, ".env"), []byte("REGION=us\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(.env) error = %v", err)
	}
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("Chdir(tempDir) error = %v", err)
	}
	defer func() {
		_ = os.Chdir(cwd)
	}()

	cfg := Load()
	if cfg.Region != "cn" {
		t.Fatalf("Load().Region = %q, want cn from process env", cfg.Region)
	}
}

func TestLoadNormalizesUSW1AIProxyManagerBaseURLToSealosIO(t *testing.T) {
	t.Setenv("AIPROXY_MANAGER_BASE_URL", "https://aiproxy-web.usw-1.sealos.app")
	t.Setenv("AIPROXY_BASE_URL", "")

	cfg := Load()
	if cfg.AIProxyBaseURL != "https://aiproxy-web.usw-1.sealos.io" {
		t.Fatalf("Load().AIProxyBaseURL = %q, want https://aiproxy-web.usw-1.sealos.io", cfg.AIProxyBaseURL)
	}
}

func TestLoadNormalizesLegacyAIProxyBaseURLToSealosIO(t *testing.T) {
	t.Setenv("AIPROXY_MANAGER_BASE_URL", "")
	t.Setenv("AIPROXY_BASE_URL", "https://aiproxy-web.usw-1.sealos.app")

	cfg := Load()
	if cfg.AIProxyBaseURL != "https://aiproxy-web.usw-1.sealos.io" {
		t.Fatalf("Load().AIProxyBaseURL = %q, want https://aiproxy-web.usw-1.sealos.io", cfg.AIProxyBaseURL)
	}
}
