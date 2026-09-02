package worker

import (
	"context"
	"errors"
)

// Limiter bounds in-flight executions per worker process.
type Limiter struct {
	sem chan struct{}
}

func NewLimiter(maxInflight int) *Limiter {
	if maxInflight <= 0 {
		maxInflight = 256
	}
	return &Limiter{sem: make(chan struct{}, maxInflight)}
}

// TryAcquire rejects immediately when at capacity (load shedding).
func (l *Limiter) TryAcquire() error {
	select {
	case l.sem <- struct{}{}:
		return nil
	default:
		return ErrWorkerOverloaded
	}
}

func (l *Limiter) Acquire(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case l.sem <- struct{}{}:
		return nil
	}
}

func (l *Limiter) Release() {
	select {
	case <-l.sem:
	default:
	}
}

func (l *Limiter) Active() int {
	return len(l.sem)
}

func (l *Limiter) Max() int {
	return cap(l.sem)
}

var ErrWorkerOverloaded = errors.New("worker capacity exhausted")
