package handler

import (
	"bytes"
	"context"
	"io"
	"strings"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/kube"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/remotecommand"
)

const agentExecRetryInterval = 2 * time.Second

func execInAgentPodWithRetry(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
	command []string,
	stdinPayload []byte,
	tty bool,
	sizeQueue remotecommand.TerminalSizeQueue,
) (string, string, error) {
	ticker := time.NewTicker(agentExecRetryInterval)
	defer ticker.Stop()

	var lastErr error
	var lastStdout string
	var lastStderr string

	for {
		pod, err := kube.ResolveAgentPod(ctx, clientset, factory.Namespace(), agentName)
		if err == nil {
			var stdout bytes.Buffer
			var stderr bytes.Buffer

			var stdin io.Reader
			if len(stdinPayload) > 0 {
				stdin = bytes.NewReader(stdinPayload)
			}

			err = kube.ExecInPod(
				ctx,
				clientset,
				factory.RESTConfig(),
				factory.Namespace(),
				pod.Name,
				pod.Container,
				command,
				stdin,
				&stdout,
				&stderr,
				tty,
				sizeQueue,
			)
			lastStdout = strings.TrimSpace(stdout.String())
			lastStderr = strings.TrimSpace(stderr.String())
			if err == nil {
				return lastStdout, lastStderr, nil
			}
			lastErr = err
			if !isRetryableAgentExecError(err) {
				return lastStdout, lastStderr, err
			}
		} else {
			lastErr = err
			lastStdout = ""
			lastStderr = ""
			if !isRetryableAgentExecError(err) {
				return "", "", err
			}
		}

		select {
		case <-ctx.Done():
			if lastErr != nil {
				return lastStdout, lastStderr, lastErr
			}
			return lastStdout, lastStderr, ctx.Err()
		case <-ticker.C:
		}
	}
}

func isRetryableAgentExecError(err error) bool {
	if err == nil {
		return false
	}

	message := strings.ToLower(strings.TrimSpace(err.Error()))
	switch {
	case strings.Contains(message, "agent pod not found"):
		return true
	case strings.Contains(message, "agent pod container is not ready"):
		return true
	case strings.Contains(message, "unable to upgrade connection"):
		return true
	case strings.Contains(message, "container not found"):
		return true
	case strings.Contains(message, "containercreating"):
		return true
	case strings.Contains(message, "container creating"):
		return true
	case strings.Contains(message, "pod initializing"):
		return true
	default:
		return false
	}
}
