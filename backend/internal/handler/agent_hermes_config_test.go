package handler

import "testing"

func TestNormalizeHermesProvider(t *testing.T) {
	t.Parallel()

	cases := map[string]struct {
		provider string
		baseURL  string
		want     string
	}{
		"empty provider stays auto": {
			provider: "",
			baseURL:  "https://aiproxy.usw-1.sealos.io/v1",
			want:     "auto",
		},
		"openai keeps openai": {
			provider: "openai",
			baseURL:  "https://api.openai.com/v1",
			want:     "openai",
		},
		"openrouter keeps openrouter": {
			provider: "openrouter",
			baseURL:  "https://openrouter.ai/api/v1",
			want:     "openrouter",
		},
		"aiproxy named provider stays named": {
			provider: "custom:aiproxy-chat",
			baseURL:  "https://aiproxy.usw-1.sealos.io/v1",
			want:     "custom:aiproxy-chat",
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
