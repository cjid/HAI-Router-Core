package worker

import (
	"context"
	"testing"
	"time"
)

func TestLimiterTryAcquire(t *testing.T) {
	tests := []struct {
		name    string
		max     int
		hold    int
		wantErr bool
	}{
		{"empty accepts", 2, 0, false},
		{"at capacity rejects", 1, 1, true},
		{"partial capacity accepts", 3, 2, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lim := NewLimiter(tt.max)
			for i := 0; i < tt.hold; i++ {
				if err := lim.TryAcquire(); err != nil {
					t.Fatalf("hold acquire %d: %v", i, err)
				}
			}
			err := lim.TryAcquire()
			if tt.wantErr && err == nil {
				t.Fatal("expected overload error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestLimiterReleaseAndReuse(t *testing.T) {
	lim := NewLimiter(1)
	if err := lim.TryAcquire(); err != nil {
		t.Fatal(err)
	}
	if err := lim.TryAcquire(); err == nil {
		t.Fatal("expected full")
	}
	lim.Release()
	if err := lim.TryAcquire(); err != nil {
		t.Fatalf("expected slot after release: %v", err)
	}
}

func TestLimiterAcquireRespectsContext(t *testing.T) {
	lim := NewLimiter(1)
	if err := lim.TryAcquire(); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	err := lim.Acquire(ctx)
	if err == nil {
		t.Fatal("expected context error while at capacity")
	}
}
