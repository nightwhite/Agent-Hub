package agenttemplate

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"sigs.k8s.io/yaml"
)

const (
	externalRegistryPath       = "registry/agents.yaml"
	externalSharedTemplateRoot = "template/devbox-agent"
	externalCacheTTL           = 5 * time.Minute
)

type externalRegistry struct {
	Agents []externalRegistryEntry `yaml:"agents"`
}

type externalRegistryEntry struct {
	Name    string `yaml:"name"`
	Path    string `yaml:"path"`
	Enabled bool   `yaml:"enabled"`
}

type externalIndex struct {
	ID          string          `json:"id"`
	Icon        string          `json:"icon"`
	Name        string          `json:"name"`
	Description string          `json:"desc"`
	Status      string          `json:"status"`
	Image       string          `json:"image"`
	Runtime     externalRuntime `json:"runtime"`
}

type externalRuntime struct {
	Kind string `json:"kind"`
}

type externalDeploy struct {
	Spec struct {
		Template struct {
			Spec struct {
				Containers []externalContainer `yaml:"containers"`
			} `yaml:"spec"`
		} `yaml:"template"`
	} `yaml:"spec"`
}

type externalContainer struct {
	Name       string       `yaml:"name"`
	Image      string       `yaml:"image"`
	Args       []string     `yaml:"args"`
	WorkingDir string       `yaml:"workingDir"`
	Env        []EnvVar     `yaml:"env"`
	Ports      []deployPort `yaml:"ports"`
}

type deployPort struct {
	ContainerPort int32 `yaml:"containerPort"`
}

type cachedExternalRoot struct {
	root      string
	expiresAt time.Time
}

var (
	externalCacheMu      sync.Mutex
	externalFetchMuByURL = map[string]*sync.Mutex{}
	externalRootByURL    = map[string]cachedExternalRoot{}
	externalSharedOnce   sync.Once
	externalSharedDir    string
	externalSharedErr    error
	externalHTTPClient   = &http.Client{Timeout: 30 * time.Second}
)

func listExternal(options SourceOptions) ([]Definition, error) {
	rootDir, err := ensureExternalRoot(options)
	if err != nil {
		return nil, err
	}

	registry, err := readExternalRegistry(rootDir)
	if err != nil {
		return nil, err
	}

	definitions := make([]Definition, 0, len(registry.Agents))
	for _, entry := range registry.Agents {
		if !entry.Enabled {
			continue
		}
		definition, err := resolveExternalEntry(rootDir, entry, options)
		if err != nil {
			return nil, err
		}
		definitions = append(definitions, definition)
	}

	sort.Slice(definitions, func(i, j int) bool {
		return definitions[i].ID < definitions[j].ID
	})
	return definitions, nil
}

func resolveExternal(templateID string, options SourceOptions) (Definition, error) {
	id := strings.TrimSpace(templateID)
	if id == "" {
		return Definition{}, fmt.Errorf("template id is required")
	}

	rootDir, err := ensureExternalRoot(options)
	if err != nil {
		return Definition{}, err
	}

	registry, err := readExternalRegistry(rootDir)
	if err != nil {
		return Definition{}, err
	}

	for _, entry := range registry.Agents {
		if !entry.Enabled {
			continue
		}
		if strings.TrimSpace(entry.Name) != id {
			continue
		}
		return resolveExternalEntry(rootDir, entry, options)
	}

	return Definition{}, fmt.Errorf("template %q not found in external registry", id)
}

func ensureExternalRoot(options SourceOptions) (string, error) {
	source := strings.TrimSpace(options.GitURL)
	if source == "" {
		return "", fmt.Errorf("external template git url is required")
	}

	if isLocalExternalRoot(source) {
		return filepath.Clean(source), nil
	}

	cacheKey := source
	cacheDir := strings.TrimSpace(options.CacheDir)
	if cacheDir == "" {
		cacheDir = defaultExternalCacheDir()
	}
	targetDir := filepath.Join(cacheDir, cacheDirectoryName(source))

	if root, ok := getCachedExternalRoot(cacheKey); ok {
		return root, nil
	}

	fetchMu := externalFetchLock(cacheKey)
	fetchMu.Lock()
	defer fetchMu.Unlock()

	if root, ok := getCachedExternalRoot(cacheKey); ok {
		return root, nil
	}

	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return "", fmt.Errorf("create external template cache dir: %w", err)
	}

	if archiveURL, ok := githubZipballURL(source); ok {
		if err := os.RemoveAll(targetDir); err != nil {
			return "", fmt.Errorf("remove stale external template archive cache: %w", err)
		}
		if err := downloadAndExtractZipball(archiveURL, targetDir); err != nil {
			return "", err
		}
	} else if isGitCheckout(targetDir) {
		if err := runGit(targetDir, "fetch", "--depth=1", "origin"); err != nil {
			return "", err
		}
		if err := runGit(targetDir, "reset", "--hard", "FETCH_HEAD"); err != nil {
			return "", err
		}
	} else {
		if err := os.RemoveAll(targetDir); err != nil {
			return "", fmt.Errorf("remove stale external template git cache: %w", err)
		}
		if err := runGit("", "clone", "--depth=1", source, targetDir); err != nil {
			return "", err
		}
	}

	if !isLocalExternalRoot(targetDir) {
		return "", fmt.Errorf("external template registry not found in %s", targetDir)
	}

	externalCacheMu.Lock()
	externalRootByURL[cacheKey] = cachedExternalRoot{
		root:      targetDir,
		expiresAt: time.Now().Add(externalCacheTTL),
	}
	externalCacheMu.Unlock()
	return targetDir, nil
}

func getCachedExternalRoot(cacheKey string) (string, bool) {
	externalCacheMu.Lock()
	defer externalCacheMu.Unlock()
	cached, ok := externalRootByURL[cacheKey]
	if !ok || !time.Now().Before(cached.expiresAt) || !isLocalExternalRoot(cached.root) {
		return "", false
	}
	return cached.root, true
}

func externalFetchLock(cacheKey string) *sync.Mutex {
	externalCacheMu.Lock()
	defer externalCacheMu.Unlock()
	fetchMu := externalFetchMuByURL[cacheKey]
	if fetchMu == nil {
		fetchMu = &sync.Mutex{}
		externalFetchMuByURL[cacheKey] = fetchMu
	}
	return fetchMu
}

func readExternalRegistry(rootDir string) (externalRegistry, error) {
	raw, err := os.ReadFile(filepath.Join(rootDir, externalRegistryPath))
	if err != nil {
		return externalRegistry{}, fmt.Errorf("read external registry: %w", err)
	}

	var registry externalRegistry
	if err := yaml.Unmarshal(raw, &registry); err != nil {
		return externalRegistry{}, fmt.Errorf("parse external registry: %w", err)
	}
	return registry, nil
}

func resolveExternalEntry(rootDir string, entry externalRegistryEntry, options SourceOptions) (Definition, error) {
	agentDir, err := safeJoinExternalPath(rootDir, entry.Path)
	if err != nil {
		return Definition{}, err
	}
	index, err := readExternalIndex(agentDir)
	if err != nil {
		return Definition{}, err
	}
	deploy, err := readExternalDeploy(agentDir)
	if err != nil {
		return Definition{}, err
	}

	id := firstNonEmpty(index.ID, entry.Name)
	base, _ := Resolve(id, options.LocalDir)
	definition := externalBaseDefinition(id, index, base, options.GitURL)
	applyExternalDeploy(&definition, deploy, options.GitURL)
	if err := applyExternalConfig(&definition, agentDir); err != nil {
		return Definition{}, err
	}

	sharedRoot, err := resolveExternalSharedTemplateRoot()
	if err != nil {
		return Definition{}, err
	}
	definition.rootDir = sharedRoot
	definition.ManifestDir = "manifests"
	definition.Bootstrap = ScriptSpec{Script: "bootstrap.sh", Shell: "bash", TimeoutSeconds: 30}
	definition.Healthcheck = ScriptSpec{Script: "healthcheck.sh", Shell: "bash", TimeoutSeconds: 30}
	definition.BackendSupported = true
	definition.CreateDisabledReason = ""

	if err := validateDefinition(definition); err != nil {
		return Definition{}, fmt.Errorf("invalid external template %s: %w", id, err)
	}
	return definition, nil
}

func readExternalIndex(agentDir string) (externalIndex, error) {
	raw, err := os.ReadFile(filepath.Join(agentDir, "index.json"))
	if err != nil {
		return externalIndex{}, fmt.Errorf("read external index: %w", err)
	}

	var index externalIndex
	if err := json.Unmarshal(raw, &index); err != nil {
		return externalIndex{}, fmt.Errorf("parse external index: %w", err)
	}
	return index, nil
}

func readExternalDeploy(agentDir string) (externalDeploy, error) {
	raw, err := os.ReadFile(filepath.Join(agentDir, "deploy.yaml"))
	if err != nil {
		return externalDeploy{}, fmt.Errorf("read external deploy: %w", err)
	}

	var deploy externalDeploy
	if err := yaml.Unmarshal(raw, &deploy); err != nil {
		return externalDeploy{}, fmt.Errorf("parse external deploy: %w", err)
	}
	return deploy, nil
}

func externalBaseDefinition(id string, index externalIndex, base Definition, source string) Definition {
	if strings.TrimSpace(base.ID) == "" {
		base = defaultExternalDefinition(id)
	}

	base.ID = firstNonEmpty(index.ID, id, base.ID)
	base.Name = firstNonEmpty(index.Name, base.Name, id)
	base.ShortName = firstNonEmpty(base.ShortName, index.Name, id)
	base.Description = firstNonEmpty(index.Description, base.Description, index.Name, id)
	base.Image = normalizeExternalImage(firstNonEmpty(index.Image, base.Image), source)
	base.User = "agent"
	base.WorkingDir = "/workspace"
	base.Presentation.LogoKey = firstNonEmpty(base.Presentation.LogoKey, id)
	return base
}

func defaultExternalDefinition(id string) Definition {
	return Definition{
		ID:               id,
		Name:             id,
		ShortName:        id,
		Description:      id,
		Image:            "agent-hub/" + id + ":latest",
		Port:             8642,
		DefaultArgs:      []string{"start"},
		BackendSupported: true,
		WorkingDir:       "/workspace",
		User:             "agent",
		Presentation: Presentation{
			LogoKey:    id,
			BrandColor: "#2563eb",
			DocsLabel:  "Agent",
		},
		Workspaces: []WorkspaceDefinition{
			{Key: "overview", Label: "概览"},
			{Key: "terminal", Label: "终端"},
			{Key: "files", Label: "文件"},
			{Key: "settings", Label: "设置"},
		},
		Access: []AccessDefinition{
			{Key: "terminal", Label: "终端"},
			{Key: "files", Label: "文件", RootPath: "/workspace"},
			{Key: "ssh", Label: "SSH"},
			{Key: "ide", Label: "IDE", Modes: []string{"cursor", "vscode", "zed", "gateway"}},
		},
		Actions: []ActionDefinition{
			{Key: "open-terminal", Label: "终端"},
			{Key: "open-files", Label: "文件"},
			{Key: "open-settings", Label: "设置"},
			{Key: "run", Label: "启动"},
			{Key: "pause", Label: "暂停"},
			{Key: "delete", Label: "删除"},
		},
		Settings: SettingsSchema{
			Runtime: defaultRuntimeSettings(),
			Agent:   []SettingField{},
		},
		RegionModelPresets: map[string][]ModelPreset{
			"us": {},
			"cn": {},
		},
	}
}

func applyExternalDeploy(definition *Definition, deploy externalDeploy, source string) {
	container, ok := firstDeployContainer(definition.ID, deploy)
	if !ok {
		return
	}

	definition.Image = normalizeExternalImage(firstNonEmpty(container.Image, definition.Image), source)
	if len(container.Args) > 0 {
		definition.DefaultArgs = append([]string(nil), container.Args...)
	}
	definition.WorkingDir = firstNonEmpty(container.WorkingDir, definition.WorkingDir, "/workspace")
	syncExternalFileAccessRoot(definition)
	if port := resolveExternalPort(container, definition.Port); port > 0 {
		definition.Port = port
	}
	definition.Env = append([]EnvVar(nil), container.Env...)
}

func syncExternalFileAccessRoot(definition *Definition) {
	rootPath := strings.TrimSpace(definition.WorkingDir)
	if rootPath == "" {
		return
	}
	for idx := range definition.Access {
		if strings.TrimSpace(definition.Access[idx].Key) == "files" {
			definition.Access[idx].RootPath = rootPath
		}
	}
}

func applyExternalConfig(definition *Definition, agentDir string) error {
	configPath := filepath.Join(agentDir, "config.json")
	scriptPath := filepath.Join(agentDir, "config.sh")

	if _, err := os.Stat(configPath); err == nil {
		definition.Config.SchemaPath = "/opt/agent/config.json"
		if port := portFromConfigManifest(configPath); port > 0 {
			definition.Port = port
		}
		if configSupportsAction(configPath, "model", "set-main") {
			ensureExternalModelSettings(definition)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat external config.json: %w", err)
	}

	if _, err := os.Stat(scriptPath); err == nil {
		definition.Config.ScriptPath = "/opt/agent/config.sh"
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat external config.sh: %w", err)
	}

	return nil
}

func firstDeployContainer(id string, deploy externalDeploy) (externalContainer, bool) {
	containers := deploy.Spec.Template.Spec.Containers
	if len(containers) == 0 {
		return externalContainer{}, false
	}

	for _, container := range containers {
		if strings.TrimSpace(container.Name) == id {
			return container, true
		}
	}
	return containers[0], true
}

func resolveExternalPort(container externalContainer, fallback int32) int32 {
	for _, env := range container.Env {
		if strings.TrimSpace(env.Name) != "API_SERVER_PORT" {
			continue
		}
		if parsed, err := strconv.ParseInt(strings.TrimSpace(env.Value), 10, 32); err == nil && parsed > 0 {
			return int32(parsed)
		}
	}

	for _, port := range container.Ports {
		if port.ContainerPort > 0 {
			return port.ContainerPort
		}
	}

	return fallback
}

func normalizeExternalImage(image, source string) string {
	image = strings.TrimSpace(image)
	if !strings.HasPrefix(image, "agent-hub/") {
		return image
	}

	owner, _, ok := githubRepository(source)
	if !ok {
		return image
	}

	nameAndTag := strings.TrimPrefix(image, "agent-hub/")
	if strings.TrimSpace(nameAndTag) == "" || strings.Contains(nameAndTag, "/") {
		return image
	}
	return "ghcr.io/" + strings.ToLower(owner) + "/" + nameAndTag
}

func ensureExternalModelSettings(definition *Definition) {
	if definitionHasAgentBinding(*definition, "model") {
		return
	}

	definition.Settings.Agent = append(definition.Settings.Agent, defaultExternalModelSettings()...)
	if len(definition.RegionModelPresets["us"]) == 0 && len(definition.RegionModelPresets["cn"]) == 0 {
		definition.RegionModelPresets = defaultExternalModelPresets()
	}
}

func definitionHasAgentBinding(definition Definition, key string) bool {
	for _, field := range definition.Settings.Agent {
		if strings.TrimSpace(field.Binding.Kind) == "agent" && strings.TrimSpace(field.Binding.Key) == key {
			return true
		}
	}
	return false
}

func defaultExternalModelSettings() []SettingField {
	return []SettingField{
		{
			Key:         "provider",
			Label:       "Provider",
			Type:        "select",
			Required:    true,
			ReadOnly:    true,
			Binding:     SettingBinding{Kind: "agent", Key: "modelProvider"},
			Rebootstrap: true,
			Options: []SettingOption{
				{Value: "custom:aiproxy-chat", Label: "AI-Proxy · Chat Completions"},
				{Value: "custom:aiproxy-responses", Label: "AI-Proxy · Responses API"},
				{Value: "custom:aiproxy-anthropic", Label: "AI-Proxy · Anthropic Messages"},
			},
		},
		{
			Key:         "model",
			Label:       "模型",
			Type:        "select",
			Required:    true,
			Binding:     SettingBinding{Kind: "agent", Key: "model"},
			Rebootstrap: true,
		},
		{
			Key:         "baseURL",
			Label:       "Base URL",
			Type:        "url",
			Required:    true,
			Binding:     SettingBinding{Kind: "agent", Key: "modelBaseURL"},
			Rebootstrap: true,
		},
		{
			Key:      "keySource",
			Label:    "密钥来源",
			Type:     "text",
			ReadOnly: true,
			Binding:  SettingBinding{Kind: "derived", Key: "keySource"},
		},
	}
}

func defaultExternalModelPresets() map[string][]ModelPreset {
	return map[string][]ModelPreset{
		"us": {
			{Value: "gpt-5.4", Label: "GPT-5.4", Helper: "OpenAI", Provider: "custom:aiproxy-responses", APIMode: "codex_responses"},
			{Value: "gpt-5.4-mini", Label: "GPT-5.4 Mini", Helper: "OpenAI", Provider: "custom:aiproxy-responses", APIMode: "codex_responses"},
			{Value: "claude-sonnet-4.6", Label: "Claude Sonnet 4.6", Helper: "Anthropic", Provider: "custom:aiproxy-anthropic", APIMode: "anthropic_messages"},
			{Value: "glm-4.6", Label: "GLM-4.6", Helper: "GLM", Provider: "custom:aiproxy-chat", APIMode: "chat_completions"},
			{Value: "qwen3-coder-plus", Label: "Qwen3 Coder Plus", Helper: "Qwen", Provider: "custom:aiproxy-chat", APIMode: "chat_completions"},
		},
		"cn": {
			{Value: "glm-4.6", Label: "GLM-4.6", Helper: "GLM", Provider: "custom:aiproxy-chat", APIMode: "chat_completions"},
			{Value: "qwen3-coder-plus", Label: "Qwen3 Coder Plus", Helper: "Qwen", Provider: "custom:aiproxy-chat", APIMode: "chat_completions"},
		},
	}
}

func portFromConfigManifest(path string) int32 {
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0
	}

	var manifest map[string]any
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return 0
	}

	for _, locale := range []string{"zh", "en"} {
		resources := asSlice(asMap(manifest[locale])["resources"])
		for _, rawResource := range resources {
			resource := asMap(rawResource)
			if strings.TrimSpace(fmt.Sprint(resource["resource"])) != "gateway" {
				continue
			}
			for _, rawAction := range asSlice(resource["actions"]) {
				for _, rawArg := range asSlice(asMap(rawAction)["args"]) {
					arg := asMap(rawArg)
					if strings.TrimSpace(fmt.Sprint(arg["name"])) != "port" {
						continue
					}
					switch value := arg["default"].(type) {
					case float64:
						if value > 0 {
							return int32(value)
						}
					case string:
						if parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 32); err == nil && parsed > 0 {
							return int32(parsed)
						}
					}
				}
			}
		}
	}
	return 0
}

func configSupportsAction(path, resourceName, actionName string) bool {
	raw, err := os.ReadFile(path)
	if err != nil {
		return false
	}

	var manifest map[string]any
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return false
	}

	for _, locale := range []string{"zh", "en"} {
		resources := asSlice(asMap(manifest[locale])["resources"])
		for _, rawResource := range resources {
			resource := asMap(rawResource)
			if strings.TrimSpace(fmt.Sprint(resource["resource"])) != resourceName {
				continue
			}
			for _, rawAction := range asSlice(resource["actions"]) {
				action := asMap(rawAction)
				if strings.TrimSpace(fmt.Sprint(action["action"])) == actionName {
					return true
				}
			}
		}
	}
	return false
}

func defaultRuntimeSettings() []SettingField {
	return []SettingField{
		{Key: "cpu", Label: "CPU", Type: "quantity", Required: true, Binding: SettingBinding{Kind: "runtime", Key: "cpu"}},
		{Key: "memory", Label: "内存", Type: "quantity", Required: true, Binding: SettingBinding{Kind: "runtime", Key: "memory"}},
		{Key: "storage", Label: "存储", Type: "quantity", Required: true, Binding: SettingBinding{Kind: "runtime", Key: "storage"}},
	}
}

func resolveExternalSharedTemplateRoot() (string, error) {
	externalSharedOnce.Do(func() {
		if cwd, err := os.Getwd(); err == nil {
			candidates := []string{
				externalSharedTemplateRoot,
				filepath.Join("..", externalSharedTemplateRoot),
				filepath.Join("..", "..", externalSharedTemplateRoot),
				filepath.Join("..", "..", "..", externalSharedTemplateRoot),
				filepath.Join("..", "..", "..", "..", externalSharedTemplateRoot),
			}
			for _, relative := range candidates {
				candidate := filepath.Join(cwd, relative)
				if externalManifestTemplateFilesExist(filepath.Join(candidate, "manifests")) {
					externalSharedDir = filepath.Clean(candidate)
					return
				}
			}
		}

		if baseDir, err := resolveTemplateBaseDir(""); err == nil {
			candidate := filepath.Join(filepath.Dir(baseDir), externalSharedTemplateRoot)
			if externalManifestTemplateFilesExist(filepath.Join(candidate, "manifests")) {
				externalSharedDir = filepath.Clean(candidate)
				return
			}
		}

		externalSharedErr = fmt.Errorf("external shared template root not found")
	})
	if externalSharedErr != nil {
		return "", externalSharedErr
	}
	return externalSharedDir, nil
}

func isLocalExternalRoot(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	info, err := os.Stat(filepath.Join(filepath.Clean(path), externalRegistryPath))
	return err == nil && !info.IsDir()
}

func safeJoinExternalPath(rootDir, relativePath string) (string, error) {
	root := filepath.Clean(rootDir)
	relative := filepath.Clean(strings.TrimSpace(relativePath))
	if relative == "." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) || filepath.IsAbs(relative) {
		return "", fmt.Errorf("invalid external agent path %q", relativePath)
	}
	joined := filepath.Join(root, relative)
	if joined != root && !strings.HasPrefix(joined, root+string(os.PathSeparator)) {
		return "", fmt.Errorf("external agent path escapes repository root: %q", relativePath)
	}
	return joined, nil
}

func externalManifestTemplateFilesExist(dir string) bool {
	for _, name := range []string{"devbox.yaml.tmpl", "service.yaml.tmpl", "ingress.yaml.tmpl"} {
		info, err := os.Stat(filepath.Join(dir, name))
		if err != nil || info.IsDir() {
			return false
		}
	}
	return true
}

func isGitCheckout(path string) bool {
	info, err := os.Stat(filepath.Join(path, ".git"))
	return err == nil && info.IsDir()
}

func githubZipballURL(source string) (string, bool) {
	owner, repo, ok := githubRepository(source)
	if !ok {
		return "", false
	}
	return "https://api.github.com/repos/" + owner + "/" + repo + "/zipball", true
}

func githubRepository(source string) (string, string, bool) {
	parsed, err := url.Parse(strings.TrimSpace(source))
	if err != nil {
		return "", "", false
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return "", "", false
	}
	if !strings.EqualFold(parsed.Host, "github.com") {
		return "", "", false
	}

	cleanedPath := strings.Trim(path.Clean(parsed.Path), "/")
	parts := strings.Split(cleanedPath, "/")
	if len(parts) < 2 {
		return "", "", false
	}

	owner := strings.TrimSpace(parts[0])
	repo := strings.TrimSuffix(strings.TrimSpace(parts[1]), ".git")
	if owner == "" || repo == "" {
		return "", "", false
	}

	return owner, repo, true
}

func downloadAndExtractZipball(archiveURL, targetDir string) error {
	req, err := http.NewRequest(http.MethodGet, archiveURL, nil)
	if err != nil {
		return fmt.Errorf("build template archive request: %w", err)
	}
	req.Header.Set("User-Agent", "agent-hub-template-fetcher")
	applyGitHubAuthentication(req)

	resp, err := externalHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("download external template archive: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("download external template archive: unexpected status %d", resp.StatusCode)
	}

	tempFile, err := os.CreateTemp("", "agent-hub-template-*.zip")
	if err != nil {
		return fmt.Errorf("create external template archive temp file: %w", err)
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if _, err := io.Copy(tempFile, resp.Body); err != nil {
		_ = tempFile.Close()
		return fmt.Errorf("write external template archive: %w", err)
	}
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close external template archive: %w", err)
	}

	reader, err := zip.OpenReader(tempPath)
	if err != nil {
		return fmt.Errorf("open external template archive: %w", err)
	}
	defer reader.Close()

	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return fmt.Errorf("create external template target dir: %w", err)
	}

	for _, file := range reader.File {
		relative := stripArchiveRoot(file.Name)
		if relative == "" {
			continue
		}
		destination, err := safeJoinExternalPath(targetDir, relative)
		if err != nil {
			return err
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(destination, 0o755); err != nil {
				return fmt.Errorf("create archive directory: %w", err)
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
			return fmt.Errorf("create archive file directory: %w", err)
		}

		src, err := file.Open()
		if err != nil {
			return fmt.Errorf("open archive file: %w", err)
		}
		dst, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, file.Mode())
		if err != nil {
			_ = src.Close()
			return fmt.Errorf("create archive file: %w", err)
		}
		_, copyErr := io.Copy(dst, src)
		closeErr := dst.Close()
		_ = src.Close()
		if copyErr != nil {
			return fmt.Errorf("extract archive file: %w", copyErr)
		}
		if closeErr != nil {
			return fmt.Errorf("close archive file: %w", closeErr)
		}
	}

	return nil
}

func githubTokenFromEnv() string {
	for _, key := range []string{"GITHUB_TOKEN", "GITHUB_API_TOKEN"} {
		if token := strings.TrimSpace(os.Getenv(key)); token != "" {
			return token
		}
	}
	return ""
}

func applyGitHubAuthentication(req *http.Request) {
	if req == nil || req.URL == nil {
		return
	}
	host := strings.ToLower(req.URL.Hostname())
	if host != "api.github.com" && host != "github.com" {
		return
	}
	if token := githubTokenFromEnv(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
}

func stripArchiveRoot(name string) string {
	cleaned := path.Clean(strings.TrimSpace(name))
	if cleaned == "." || cleaned == "/" {
		return ""
	}
	cleaned = strings.TrimPrefix(cleaned, "/")
	parts := strings.SplitN(cleaned, "/", 2)
	if len(parts) != 2 {
		return ""
	}
	return parts[1]
}

func runGit(dir string, args ...string) error {
	cmd := exec.Command("git", args...)
	if strings.TrimSpace(dir) != "" {
		cmd.Dir = dir
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git %s failed: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return nil
}

func defaultExternalCacheDir() string {
	return filepath.Join(os.TempDir(), "agent-hub-template-cache")
}

func cacheDirectoryName(source string) string {
	sum := sha256.Sum256([]byte(source))
	parsed, err := url.Parse(source)
	name := "template"
	if err == nil && strings.TrimSpace(parsed.Path) != "" {
		name = strings.TrimSuffix(filepath.Base(parsed.Path), ".git")
	}
	name = strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, name)
	return name + "-" + hex.EncodeToString(sum[:])[:12]
}

func asMap(value any) map[string]any {
	result, _ := value.(map[string]any)
	return result
}

func asSlice(value any) []any {
	result, _ := value.([]any)
	return result
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
