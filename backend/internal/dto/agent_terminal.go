package dto

type AgentTerminalSessionResponse struct {
	TerminalName      string `json:"terminalName"`
	IFrameURL         string `json:"iframeUrl"`
	Namespace         string `json:"namespace"`
	PodName           string `json:"podName"`
	ContainerName     string `json:"containerName"`
	Command           string `json:"command"`
	KeepaliveSeconds  int    `json:"keepaliveSeconds"`
	AvailableReplicas int64  `json:"availableReplicas"`
}
