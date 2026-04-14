package agent

type Agent struct {
	Name          string
	AliasName     string
	Namespace     string
	CPU           string
	Memory        string
	Storage       string
	ModelProvider string
	ModelBaseURL  string
	ModelAPIKey   string
	Model         string
	APIServerKey  string
	IngressDomain string
	Status        Status
}
