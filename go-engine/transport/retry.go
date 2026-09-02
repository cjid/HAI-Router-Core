package transport

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/cjid/hai-router/go-engine/protocol"
)

const maxTransportRetries = 2

// isSafePreSendRetry reports whether the failure happened before ambiguous upstream processing.
func isSafePreSendRetry(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}
	msg := strings.ToLower(err.Error())
	for _, needle := range []string{
		"connection refused",
		"no such host",
		"network is unreachable",
		"tls:",
		"dial tcp",
		"dial udp",
		"proxyconnect",
		"i/o timeout",
	} {
		if strings.Contains(msg, needle) {
			return true
		}
	}
	return false
}

// ExecuteWithSafeRetry retries only transport-safe pre-send failures.
func (c *Client) ExecuteWithSafeRetry(ctx context.Context, method, rawURL string, headers map[string]string, body string, egress protocol.EgressSpec) (*http.Response, error) {
	return c.ExecuteWithSafeRetryHeaderTimeout(ctx, method, rawURL, headers, body, egress, 0)
}

// ExecuteWithSafeRetryHeaderTimeout applies an optional per-request header timeout.
// When headerTimeout is zero, pooled transport defaults apply.
func (c *Client) ExecuteWithSafeRetryHeaderTimeout(ctx context.Context, method, rawURL string, headers map[string]string, body string, egress protocol.EgressSpec, headerTimeout time.Duration) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt <= maxTransportRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt*200) * time.Millisecond):
			}
		}
		var resp *http.Response
		var err error
		if headerTimeout > 0 {
			resp, err = c.ExecuteWithEgressHeaderTimeout(ctx, method, rawURL, headers, body, egress, headerTimeout)
		} else {
			resp, err = c.ExecuteWithEgress(ctx, method, rawURL, headers, body, egress)
		}
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if !isSafePreSendRetry(err) {
			return nil, err
		}
	}
	return nil, lastErr
}
