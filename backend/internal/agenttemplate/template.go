package agenttemplate

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"sigs.k8s.io/yaml"
)

const templateRootDir = "template"

type Definition struct {
	ID          string     `yaml:"id"`
	Name        string     `yaml:"name"`
	WorkingDir  string     `yaml:"workingDir"`
	ManifestDir string     `yaml:"manifestDir"`
	Bootstrap   ScriptSpec `yaml:"bootstrap"`
	Healthcheck ScriptSpec `yaml:"healthcheck"`
	rootDir     string
}

type ScriptSpec struct {
	Script         string `yaml:"script"`
	Shell          string `yaml:"shell"`
	TimeoutSeconds int    `yaml:"timeoutSeconds"`
}

func Resolve(templateID, override string) (Definition, error) {
	id := strings.TrimSpace(templateID)
	if id == "" {
		return Definition{}, fmt.Errorf("template id is required")
	}

	rootDir, err := resolveTemplateRootDir(id, override)
	if err != nil {
		return Definition{}, err
	}

	raw, err := os.ReadFile(filepath.Join(rootDir, "template.yaml"))
	if err != nil {
		return Definition{}, fmt.Errorf("read template metadata: %w", err)
	}

	var definition Definition
	if err := yaml.Unmarshal(raw, &definition); err != nil {
		return Definition{}, fmt.Errorf("parse template metadata: %w", err)
	}

	if strings.TrimSpace(definition.ID) == "" {
		definition.ID = id
	}
	if strings.TrimSpace(definition.ManifestDir) == "" {
		definition.ManifestDir = "manifests"
	}
	if strings.TrimSpace(definition.WorkingDir) == "" {
		definition.WorkingDir = "/opt/data/workspace"
	}
	definition.Bootstrap = normalizeScriptSpec(definition.Bootstrap, "bootstrap.sh", 180)
	definition.Healthcheck = normalizeScriptSpec(definition.Healthcheck, "healthcheck.sh", 60)
	definition.rootDir = rootDir

	return definition, nil
}

func (d Definition) ManifestPath() string {
	return filepath.Join(d.rootDir, d.ManifestDir)
}

func (d Definition) BootstrapScriptPath() string {
	return filepath.Join(d.rootDir, d.Bootstrap.Script)
}

func (d Definition) HealthcheckScriptPath() string {
	return filepath.Join(d.rootDir, d.Healthcheck.Script)
}

func normalizeScriptSpec(spec ScriptSpec, fallbackScript string, fallbackTimeout int) ScriptSpec {
	if strings.TrimSpace(spec.Script) == "" {
		spec.Script = fallbackScript
	}
	if strings.TrimSpace(spec.Shell) == "" {
		spec.Shell = "bash"
	}
	if spec.TimeoutSeconds <= 0 {
		spec.TimeoutSeconds = fallbackTimeout
	}
	return spec
}

func resolveTemplateRootDir(templateID, override string) (string, error) {
	candidates := []string{}

	if trimmed := strings.TrimSpace(override); trimmed != "" {
		candidates = append(candidates, trimmed)
	}

	if cwd, err := os.Getwd(); err == nil {
		relatives := []string{
			filepath.Join(templateRootDir, templateID),
			filepath.Join("..", templateRootDir, templateID),
			filepath.Join("..", "..", templateRootDir, templateID),
			filepath.Join("..", "..", "..", templateRootDir, templateID),
			filepath.Join("..", "..", "..", "..", templateRootDir, templateID),
		}
		for _, relative := range relatives {
			candidates = append(candidates, filepath.Join(cwd, relative))
		}
	}

	if _, file, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(file), "..", "..", "..", templateRootDir, templateID))
	}

	seen := map[string]struct{}{}
	attempted := []string{}
	for _, candidate := range candidates {
		root := normalizeTemplateRootCandidate(candidate)
		if root == "" {
			continue
		}
		if _, exists := seen[root]; exists {
			continue
		}
		seen[root] = struct{}{}
		attempted = append(attempted, root)

		info, err := os.Stat(filepath.Join(root, "template.yaml"))
		if err == nil && !info.IsDir() {
			return root, nil
		}
	}

	sort.Strings(attempted)
	return "", fmt.Errorf("template %q not found under %s", templateID, strings.Join(attempted, ", "))
}

func normalizeTemplateRootCandidate(candidate string) string {
	if strings.TrimSpace(candidate) == "" {
		return ""
	}

	cleaned := filepath.Clean(candidate)
	info, err := os.Stat(cleaned)
	if err != nil || !info.IsDir() {
		return ""
	}

	if manifestInfo, manifestErr := os.Stat(filepath.Join(cleaned, "devbox.yaml.tmpl")); manifestErr == nil && !manifestInfo.IsDir() {
		return filepath.Dir(cleaned)
	}

	return cleaned
}
