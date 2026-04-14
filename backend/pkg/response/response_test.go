package response

import "testing"

func TestSuccessEnvelopeUsesStandardShape(t *testing.T) {
	t.Parallel()

	envelope := Success("req-123", map[string]any{"status": "ok"})
	if envelope.Code != 0 {
		t.Fatalf("Success().Code = %d, want 0", envelope.Code)
	}
	if envelope.Message != "ok" {
		t.Fatalf("Success().Message = %q, want ok", envelope.Message)
	}
	if envelope.Error != nil {
		t.Fatal("Success().Error must be nil")
	}
}
