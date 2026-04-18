package ws

import (
	"context"
	"strings"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/dto"
)

func TestResolveFilePathResolvesRelativePath(t *testing.T) {
	t.Parallel()

	got, err := resolveFilePath("notes/today.txt")
	if err != nil {
		t.Fatalf("resolveFilePath() error = %v", err)
	}
	if got != "/notes/today.txt" {
		t.Fatalf("resolveFilePath() = %q, want /notes/today.txt", got)
	}
}

func TestResolveFilePathAllowsAbsolutePath(t *testing.T) {
	t.Parallel()

	for _, input := range []string{"/tmp/file", "/opt/hermes/notes/today.txt"} {
		got, err := resolveFilePath(input)
		if err != nil {
			t.Fatalf("resolveFilePath(%q) error = %v", input, err)
		}
		if got != input {
			t.Fatalf("resolveFilePath(%q) = %q, want %q", input, got, input)
		}
	}
}

func TestSplitCSVFiltersEmptyValues(t *testing.T) {
	t.Parallel()

	got := splitCSV(" http://localhost:3000, ,127.0.0.1:5173 ")
	if len(got) != 2 {
		t.Fatalf("splitCSV() len = %d, want 2", len(got))
	}
}

func TestValidateMessageRequiresAuthAuthorization(t *testing.T) {
	t.Parallel()

	err := validateMessage(dto.WSMessage{Type: "auth", Data: map[string]any{}})
	if err == nil {
		t.Fatal("validateMessage(auth) should fail when authorization is missing")
	}
}

func TestValidateMessageRequiresIDForConcurrentOperations(t *testing.T) {
	t.Parallel()

	cases := []dto.WSMessage{
		{Type: "terminal.open", Data: map[string]any{"cwd": "."}},
		{Type: "terminal.input", Data: map[string]any{"input": "ls\n"}},
		{Type: "terminal.resize", Data: map[string]any{"cols": 80, "rows": 24}},
		{Type: "terminal.close", Data: map[string]any{}},
		{Type: "log.subscribe", Data: map[string]any{"tailLines": 50}},
		{Type: "log.unsubscribe", Data: map[string]any{}},
		{Type: "file.upload.begin", Data: map[string]any{"path": "a.txt"}},
		{Type: "file.upload.chunk", Data: map[string]any{"chunk": "aGVsbG8="}},
		{Type: "file.upload.end", Data: map[string]any{}},
	}

	for _, message := range cases {
		if err := validateMessage(message); err == nil {
			t.Fatalf("validateMessage(%s) should fail when id is missing", message.Type)
		}
	}
}

func TestValidateMessageAcceptsIDForConcurrentOperations(t *testing.T) {
	t.Parallel()

	message := dto.WSMessage{
		Type: "terminal.input",
		Data: map[string]any{
			"id":    "term-1",
			"input": "pwd\n",
		},
	}
	if err := validateMessage(message); err != nil {
		t.Fatalf("validateMessage() error = %v, want nil", err)
	}
}

func TestValidateMessageAllowsWhitespaceTerminalInput(t *testing.T) {
	t.Parallel()

	cases := []dto.WSMessage{
		{
			Type: "terminal.input",
			Data: map[string]any{
				"id":    "term-1",
				"input": " ",
			},
		},
		{
			Type: "terminal.input",
			Data: map[string]any{
				"id":    "term-1",
				"input": "\r",
			},
		},
	}

	for _, message := range cases {
		if err := validateMessage(message); err != nil {
			t.Fatalf("validateMessage(%q) error = %v, want nil", message.Data["input"], err)
		}
	}
}

func TestResolveFilePathResolvesDotDotRelativePath(t *testing.T) {
	t.Parallel()

	got, err := resolveFilePath("../etc/passwd")
	if err != nil {
		t.Fatalf("resolveFilePath() error = %v", err)
	}
	if got != "/etc/passwd" {
		t.Fatalf("resolveFilePath() = %q, want /etc/passwd", got)
	}
}

func TestResolveTerminalPathDefaultsToWorkspace(t *testing.T) {
	t.Parallel()

	got, err := resolveTerminalPath(".")
	if err != nil {
		t.Fatalf("resolveTerminalPath() error = %v", err)
	}
	if got != "/opt/data/workspace" {
		t.Fatalf("resolveTerminalPath() = %q, want /opt/data/workspace", got)
	}
}

func TestResolveTerminalPathAllowsHermesRuntimeRoots(t *testing.T) {
	t.Parallel()

	cases := []string{
		"/opt/data/workspace/project",
		"/opt/data/logs",
		"/opt/hermes",
		"/opt/hermes/.venv/bin",
	}

	for _, input := range cases {
		got, err := resolveTerminalPath(input)
		if err != nil {
			t.Fatalf("resolveTerminalPath(%q) error = %v", input, err)
		}
		if got != input {
			t.Fatalf("resolveTerminalPath(%q) = %q, want %q", input, got, input)
		}
	}
}

func TestResolveTerminalPathRejectsEscapes(t *testing.T) {
	t.Parallel()

	for _, input := range []string{"../etc/passwd", "/tmp/file", "/root"} {
		if _, err := resolveTerminalPath(input); err == nil {
			t.Fatalf("resolveTerminalPath(%q) should fail", input)
		}
	}
}

func TestSessionIDPrefersExplicitID(t *testing.T) {
	t.Parallel()

	got := sessionID(dto.WSMessage{
		Type:      "terminal.open",
		RequestID: "req-1",
		Data:      map[string]any{"id": "term-1"},
	})
	if got != "term-1" {
		t.Fatalf("sessionID() = %q, want term-1", got)
	}
}

func TestParseListOutputReturnsStructuredItems(t *testing.T) {
	t.Parallel()

	items := parseListOutput("a.txt\tfile\t12\nnotes\tdir\t0\n")
	if len(items) != 2 {
		t.Fatalf("parseListOutput() len = %d, want 2", len(items))
	}
	if items[0]["name"] != "a.txt" || items[0]["type"] != "file" {
		t.Fatalf("parseListOutput() first item = %#v", items[0])
	}
}

func TestListCommandUsesStatForFileSize(t *testing.T) {
	t.Parallel()

	command := listCommand("/opt/hermes")
	if strings.Contains(command, "wc -c") {
		t.Fatalf("listCommand() = %q, should not rely on wc -c", command)
	}
	if !strings.Contains(command, "find \"$dir\" -mindepth 1 -maxdepth 1") {
		t.Fatalf("listCommand() = %q, want find-based bulk listing path", command)
	}
	if !strings.Contains(command, "| sed -e 's/") || !strings.Contains(command, "dir") || !strings.Contains(command, "other") {
		t.Fatalf("listCommand() = %q, want streaming type remap for bulk listing output", command)
	}
	if !strings.Contains(command, "stat -c %s") {
		t.Fatalf("listCommand() = %q, want stat-based fallback when find -printf is unavailable", command)
	}
}

func TestFormatFileListErrorReturnsFriendlyTimeout(t *testing.T) {
	t.Parallel()

	got := formatFileListError(context.DeadlineExceeded)
	want := "directory listing timed out; the directory may contain too many entries or the container filesystem is slow"
	if got != want {
		t.Fatalf("formatFileListError() = %q, want %q", got, want)
	}
}
