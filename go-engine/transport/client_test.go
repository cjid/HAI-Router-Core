package transport

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/cjid/hai-router/go-engine/protocol"
)

func TestExecuteUpstreamSuccess(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method=%s", r.Method)
		}
		body, _ := io.ReadAll(r.Body)
		if string(body) != `{"ping":true}` {
			t.Fatalf("body=%q", string(body))
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	client := NewClient()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := client.Execute(ctx, http.MethodPost, upstream.URL, map[string]string{
		"Content-Type": "application/json",
	}, `{"ping":true}`, "", "", "", 1)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d", resp.StatusCode)
	}
	data, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(data), "ok") {
		t.Fatalf("body=%q", string(data))
	}
}

func TestExecuteCancellation(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	client := NewClient()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := client.Execute(ctx, http.MethodGet, upstream.URL, nil, "", "", "", "", 1)
	if err == nil {
		t.Fatal("expected cancellation error")
	}
}

func TestPoolIsolationByProxy(t *testing.T) {
	client := NewClient()
	k1, _ := poolKeyFromURL("https://example.com/v1", "", "", 1)
	k2, _ := poolKeyFromURL("https://example.com/v1", "http://127.0.0.1:8080", "", 1)
	tr1 := client.transportFor(k1, "")
	tr2 := client.transportFor(k2, "")
	if tr1 == tr2 {
		t.Fatal("expected distinct transports for different proxy boundaries")
	}
}

func TestPoolIsolationByGeneration(t *testing.T) {
	client := NewClient()
	k1, _ := poolKeyFromURL("https://example.com/v1", "", "", 1)
	k2, _ := poolKeyFromURL("https://example.com/v1", "", "", 2)
	tr1 := client.transportFor(k1, "")
	tr2 := client.transportFor(k2, "")
	if tr1 == tr2 {
		t.Fatal("expected distinct transports for different egress generations")
	}
}

func TestPoolGenerationImmutabilityStress(t *testing.T) {
	client := NewClient()
	seen := make(map[*http.Transport]int64)
	for gen := int64(1); gen <= 32; gen++ {
		key, err := poolKeyFromURL("https://example.com/v1", "", "", gen)
		if err != nil {
			t.Fatal(err)
		}
		tr := client.transportFor(key, "")
		if prev, ok := seen[tr]; ok && prev != gen {
			t.Fatalf("generation %d reused transport from generation %d", gen, prev)
		}
		seen[tr] = gen
	}
	if len(seen) != 32 {
		t.Fatalf("expected 32 distinct transports, got %d", len(seen))
	}
}

func TestPoolKeyIncludesBypassIP(t *testing.T) {
	k1, _ := poolKeyFromURL("https://example.com/v1", "", "203.0.113.1", 1)
	k2, _ := poolKeyFromURL("https://example.com/v1", "", "203.0.113.2", 1)
	if k1.BypassIP == k2.BypassIP {
		t.Fatal("expected distinct bypass IP in pool keys")
	}
	tr1 := NewClient().transportFor(k1, "example.com")
	tr2 := NewClient().transportFor(k2, "example.com")
	if tr1 == tr2 {
		t.Fatal("expected distinct transports for different bypass IPs")
	}
}

func TestExecuteWithEgressProxyMode(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("via-proxy"))
	}))
	defer upstream.Close()

	client := NewClient()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := client.ExecuteWithEgress(ctx, http.MethodGet, upstream.URL, nil, "", protocol.EgressSpec{
		Mode:       "proxy",
		ProxyURL:   "",
		Generation: 5,
	})
	if err != nil {
		t.Fatalf("proxy execute: %v", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if string(data) != "via-proxy" {
		t.Fatalf("body=%q", string(data))
	}
}

func TestExecuteWithEgressRelayMissingURL(t *testing.T) {
	client := NewClient()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err := client.ExecuteWithEgress(ctx, http.MethodGet, "https://example.com/v1", nil, "", protocol.EgressSpec{
		Mode: "relay",
	})
	if err == nil {
		t.Fatal("expected relay url error")
	}
}

func TestExecuteRelayMode(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-relay-target") == "" || r.Header.Get("x-relay-path") == "" {
			t.Fatalf("missing relay headers: target=%q path=%q", r.Header.Get("x-relay-target"), r.Header.Get("x-relay-path"))
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("relayed"))
	}))
	defer upstream.Close()

	client := NewClient()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := client.ExecuteWithEgress(ctx, http.MethodPost, "https://provider.example/v1/chat?x=1", map[string]string{
		"Content-Type": "application/json",
	}, `{}`, protocol.EgressSpec{
		Mode:       "relay",
		RelayURL:   upstream.URL,
		Generation: 3,
	})
	if err != nil {
		t.Fatalf("relay execute: %v", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if string(data) != "relayed" {
		t.Fatalf("body=%q", string(data))
	}
}
