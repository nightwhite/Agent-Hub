package kube

import (
	"context"
	"fmt"
	"io"
	"sort"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

type PodRef struct {
	Name      string
	Container string
}

func ResolveAgentPod(ctx context.Context, clientset *kubernetes.Clientset, namespace, agentName string) (PodRef, error) {
	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: ManagedSelector(agentName),
	})
	if err != nil {
		return PodRef{}, err
	}
	if len(pods.Items) == 0 {
		return PodRef{}, fmt.Errorf("agent pod not found")
	}

	items := append([]corev1.Pod(nil), pods.Items...)
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreationTimestamp.Time.After(items[j].CreationTimestamp.Time)
	})

	selected := items[0]
	for _, pod := range items {
		if pod.DeletionTimestamp == nil && pod.Status.Phase == corev1.PodRunning {
			selected = pod
			break
		}
	}

	if len(selected.Spec.Containers) == 0 {
		return PodRef{}, fmt.Errorf("agent pod has no containers")
	}

	return PodRef{
		Name:      selected.Name,
		Container: selected.Spec.Containers[0].Name,
	}, nil
}

func StreamPodLogs(ctx context.Context, clientset *kubernetes.Clientset, namespace, podName, containerName string, opts *corev1.PodLogOptions) (io.ReadCloser, error) {
	logOpts := &corev1.PodLogOptions{}
	if opts != nil {
		*logOpts = *opts
	}
	logOpts.Container = containerName
	return clientset.CoreV1().Pods(namespace).GetLogs(podName, logOpts).Stream(ctx)
}

func ExecInPod(
	ctx context.Context,
	clientset *kubernetes.Clientset,
	restConfig *rest.Config,
	namespace, podName, containerName string,
	command []string,
	stdin io.Reader,
	stdout, stderr io.Writer,
	tty bool,
	sizeQueue remotecommand.TerminalSizeQueue,
) error {
	req := clientset.CoreV1().RESTClient().
		Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: containerName,
			Command:   command,
			Stdin:     stdin != nil,
			Stdout:    stdout != nil,
			Stderr:    stderr != nil,
			TTY:       tty,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(restConfig, "POST", req.URL())
	if err != nil {
		return err
	}

	return executor.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:             stdin,
		Stdout:            stdout,
		Stderr:            stderr,
		Tty:               tty,
		TerminalSizeQueue: sizeQueue,
	})
}
