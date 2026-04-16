package handler

import "testing"

func TestNormalizeHermesProvider(t *testing.T) {
	t.Parallel()

	cases := map[string]struct {
		provider string
		baseURL  string
		want     string
	}{
		"empty with base url falls back to custom": {
			provider: "",
			baseURL:  "https://aiproxy.usw-1.sealos.io/v1",
			want:     "custom",
		},
		"openai maps to custom": {
			provider: "openai",
			baseURL:  "https://aiproxy.usw-1.sealos.io/v1",
			want:     "custom",
		},
		"openrouter stays openrouter": {
			provider: "openrouter",
			baseURL:  "https://openrouter.ai/api/v1",
			want:     "openrouter",
		},
		"custom stays custom": {
			provider: "custom",
			baseURL:  "https://aiproxy.usw-1.sealos.io/v1",
			want:     "custom",
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := normalizeHermesProvider(tc.provider, tc.baseURL); got != tc.want {
				t.Fatalf("normalizeHermesProvider(%q, %q) = %q, want %q", tc.provider, tc.baseURL, got, tc.want)
			}
		})
	}
}
