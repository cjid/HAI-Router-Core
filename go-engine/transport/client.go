package transport

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/cjid/hai-router/go-engine/protocol"
)

const (
	defaultIdleConns        = 64
	defaultIdleConnsPerHost = 16
	defaultTLSHandshake     = 10 * time.Second
	defaultResponseHeader   = 120 * time.Second
)

// PoolKey identifies a reusable connection pool boundary.
type PoolKey struct {
	Scheme     string
	Host       string
	ProxyURL   string
	BypassIP   string
	Generation int64
}

type poolEntry struct {
	transport *http.Transport
}

// Client owns HTTP transports and executes provider requests.
type Client struct {
	mu    sync.RWMutex
	pools map[PoolKey]*poolEntry
}

func NewClient() *Client {
	return &Client{pools: make(map[PoolKey]*poolEntry)}
}

func poolKeyFromURL(rawURL string, proxyURL string, bypassIP string, generation int64) (PoolKey, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return PoolKey{}, err
	}
	scheme := u.Scheme
	if scheme == "" {
		scheme = "https"
	}
	host := u.Host
	if host == "" {
		return PoolKey{}, fmt.Errorf("missing host in url")
	}
	return PoolKey{Scheme: scheme, Host: host, ProxyURL: proxyURL, BypassIP: bypassIP, Generation: generation}, nil
}

func (c *Client) transportFor(key PoolKey, bypassHost string) *http.Transport {
	c.mu.RLock()
	if e, ok := c.pools[key]; ok {
		c.mu.RUnlock()
		return e.transport
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.pools[key]; ok {
		return e.transport
	}

	dialer := &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}
	dialContext := dialer.DialContext
	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12}

	if key.BypassIP != "" && bypassHost != "" {
		bypassIP := key.BypassIP
		dialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
			_, port, err := net.SplitHostPort(addr)
			if err != nil {
				port = "443"
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(bypassIP, port))
		}
		tlsConfig = &tls.Config{ServerName: bypassHost, MinVersion: tls.VersionTLS12}
	}

	tr := &http.Transport{
		Proxy:                 proxyFunc(key.ProxyURL),
		DialContext:           dialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          defaultIdleConns,
		MaxIdleConnsPerHost:   defaultIdleConnsPerHost,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   defaultTLSHandshake,
		ResponseHeaderTimeout: defaultResponseHeader,
		TLSClientConfig:       tlsConfig,
	}
	c.pools[key] = &poolEntry{transport: tr}
	return tr
}

func proxyFunc(proxyURL string) func(*http.Request) (*url.URL, error) {
	if proxyURL == "" {
		return http.ProxyFromEnvironment
	}
	parsed, err := url.Parse(proxyURL)
	if err != nil {
		return func(*http.Request) (*url.URL, error) { return nil, err }
	}
	return http.ProxyURL(parsed)
}

// ExecuteWithHeaderTimeout performs a round-trip using a cloned transport whose
// ResponseHeaderTimeout is set for this request only. The caller context governs
// stream body lifetime (client cancel), not an artificial post-header deadline.
func (c *Client) ExecuteWithHeaderTimeout(ctx context.Context, method, rawURL string, headers map[string]string, body string, proxyURL string, bypassHost string, bypassIP string, generation int64, headerTimeout time.Duration) (*http.Response, error) {
	key, err := poolKeyFromURL(rawURL, proxyURL, bypassIP, generation)
	if err != nil {
		return nil, err
	}
	base := c.transportFor(key, bypassHost)
	tr := base
	if headerTimeout > 0 {
		cloned := base.Clone()
		cloned.ResponseHeaderTimeout = headerTimeout
		tr = cloned
	}

	var bodyReader io.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, rawURL, bodyReader)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		if k == "" {
			continue
		}
		req.Header.Set(k, v)
	}

	client := &http.Client{
		Transport: tr,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	return client.Do(req)
}

// ExecuteWithEgressHeaderTimeout applies egress routing with a per-request header timeout.
func (c *Client) ExecuteWithEgressHeaderTimeout(ctx context.Context, method, rawURL string, headers map[string]string, body string, egress protocol.EgressSpec, headerTimeout time.Duration) (*http.Response, error) {
	switch egress.Mode {
	case "relay":
		if egress.RelayURL == "" {
			return nil, fmt.Errorf("relay mode requires relayUrl")
		}
		parsed, err := url.Parse(rawURL)
		if err != nil {
			return nil, err
		}
		relayHeaders := cloneHeaders(headers)
		relayHeaders["x-relay-target"] = parsed.Scheme + "://" + parsed.Host
		relayHeaders["x-relay-path"] = parsed.Path
		if parsed.RawQuery != "" {
			relayHeaders["x-relay-path"] += "?" + parsed.RawQuery
		}
		return c.ExecuteWithHeaderTimeout(ctx, method, egress.RelayURL, relayHeaders, body, "", "", "", egress.Generation, headerTimeout)
	case "proxy":
		return c.ExecuteWithHeaderTimeout(ctx, method, rawURL, headers, body, egress.ProxyURL, "", "", egress.Generation, headerTimeout)
	case "bypass":
		return c.ExecuteWithHeaderTimeout(ctx, method, rawURL, headers, body, "", egress.BypassHost, egress.BypassIP, egress.Generation, headerTimeout)
	default:
		return c.ExecuteWithHeaderTimeout(ctx, method, rawURL, headers, body, "", "", "", egress.Generation, headerTimeout)
	}
}

// Execute performs one upstream HTTP round-trip. Caller must close resp.Body.
func (c *Client) Execute(ctx context.Context, method, rawURL string, headers map[string]string, body string, proxyURL string, bypassHost string, bypassIP string, generation int64) (*http.Response, error) {
	return c.ExecuteWithHeaderTimeout(ctx, method, rawURL, headers, body, proxyURL, bypassHost, bypassIP, generation, 0)
}

// ExecuteWithEgress applies relay/bypass/proxy/direct semantics from Node SSOT.
func (c *Client) ExecuteWithEgress(ctx context.Context, method, rawURL string, headers map[string]string, body string, egress protocol.EgressSpec) (*http.Response, error) {
	switch egress.Mode {
	case "relay":
		if egress.RelayURL == "" {
			return nil, fmt.Errorf("relay mode requires relayUrl")
		}
		parsed, err := url.Parse(rawURL)
		if err != nil {
			return nil, err
		}
		relayHeaders := cloneHeaders(headers)
		relayHeaders["x-relay-target"] = parsed.Scheme + "://" + parsed.Host
		relayHeaders["x-relay-path"] = parsed.Path
		if parsed.RawQuery != "" {
			relayHeaders["x-relay-path"] += "?" + parsed.RawQuery
		}
		return c.Execute(ctx, method, egress.RelayURL, relayHeaders, body, "", "", "", egress.Generation)
	case "proxy":
		return c.Execute(ctx, method, rawURL, headers, body, egress.ProxyURL, "", "", egress.Generation)
	case "bypass":
		return c.Execute(ctx, method, rawURL, headers, body, "", egress.BypassHost, egress.BypassIP, egress.Generation)
	default:
		return c.Execute(ctx, method, rawURL, headers, body, "", "", "", egress.Generation)
	}
}

func cloneHeaders(src map[string]string) map[string]string {
	if src == nil {
		return map[string]string{}
	}
	out := make(map[string]string, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}
