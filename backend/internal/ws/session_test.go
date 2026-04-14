package ws

import (
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/dto"
)

func TestResolveFilePathStaysUnderWorkspaceRoot(t *testing.T) {
	t.Parallel()

	got, err := resolveFilePath("notes/today.txt")
	if err != nil {
		t.Fatalf("resolveFilePath() error = %v", err)
	}
	if got != "/opt/hermes/notes/today.txt" {
		t.Fatalf("resolveFilePath() = %q, want /opt/hermes/notes/today.txt", got)
	}
}

func TestResolveFilePathRejectsEscapes(t *testing.T) {
	t.Parallel()

	for _, input := range []string{"../etc/passwd", "/tmp/file"} {
		if _, err := resolveFilePath(input); err == nil {
			t.Fatalf("resolveFilePath(%q) should fail", input)
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
