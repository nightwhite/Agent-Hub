package handler

import (
	"context"
	"errors"
	"testing"
)

func TestIsCanceledRequestError(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "nil error",
			err:  nil,
			want: false,
		},
		{
			name: "context canceled",
			err:  context.Canceled,
			want: true,
		},
		{
			name: "context deadline exceeded",
			err:  context.DeadlineExceeded,
			want: true,
		},
		{
			name: "wrapped context canceled",
			err:  errors.New("request failed: context canceled"),
			want: true,
		},
		{
			name: "regular kubernetes error",
			err:  errors.New("forbidden"),
			want: false,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := isCanceledRequestError(tc.err)
			if got != tc.want {
				t.Fatalf("isCanceledRequestError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
