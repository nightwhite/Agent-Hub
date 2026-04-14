package kube

import (
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agent"
)

func TestStateToStatusOnlyExposesRunningOrPaused(t *testing.T) {
	t.Parallel()

	if got := stateToStatus("Running"); got != agent.StatusRunning {
		t.Fatalf("stateToStatus(running) = %q, want %q", got, agent.StatusRunning)
	}

	for _, input := range []string{"Paused", "Stopped", "Stopping", "Failed", "Creating"} {
		if got := stateToStatus(input); got != agent.StatusPaused {
			t.Fatalf("stateToStatus(%q) = %q, want %q", input, got, agent.StatusPaused)
		}
	}
}
