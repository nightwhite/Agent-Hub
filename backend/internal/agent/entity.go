package agent

type Agent struct {
	Name             string
	TemplateID       string
	AliasName        string
	Namespace        string
	CPU              string
	Memory           string
	Storage          string
	WorkingDir       string
	ModelProvider    string
	ModelBaseURL     string
	ModelAPIKey      string
	Model            string
	APIServerKey     string
	IngressDomain    string
	BootstrapPhase   string
	BootstrapMessage string
	Ready            bool
	Status           Status
}
