package kube

func Labels(agentName string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":     "hermes-agent",
		"app.kubernetes.io/instance": agentName,
		"agent.sealos.io/name":       agentName,
		"agent.sealos.io/managed-by": "agent-hub-backend",
		"app":                        agentName,
	}
}

func Annotations(aliasName, modelProvider, modelBaseURL, model string) map[string]string {
	annotations := map[string]string{
		"agent.sealos.io/model-provider": modelProvider,
		"agent.sealos.io/model-baseurl":  modelBaseURL,
		"agent.sealos.io/model":          model,
	}
	if aliasName != "" {
		annotations["agent.sealos.io/alias-name"] = aliasName
	}
	return annotations
}
