package worker

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/cjid/hai-router/go-engine/protocol"
)

func TestExecuteEndpointAuth(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	s := NewServer("secret-token", 8)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	spec := protocol.ExecutionSpec{
		RequestID: "r1",
		Method:    http.MethodGet,
		URL:       upstream.URL,
		Egress:    protocol.EgressSpec{Mode: "direct", Generation: 1},
	}
	body, _ := json.Marshal(spec)

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(headerWorkerToken, "wrong")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status=%d", res.StatusCode)
	}
}

func TestExecuteEndpointProxiesUpstream(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Test", "1")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("payload"))
	}))
	defer upstream.Close()

	s := NewServer("secret-token", 8)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	spec := protocol.ExecutionSpec{
		RequestID: "r2",
		Method:    http.MethodGet,
		URL:       upstream.URL,
		Egress:    protocol.EgressSpec{Mode: "direct", Generation: 42},
	}
	body, _ := json.Marshal(spec)

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(headerWorkerToken, "secret-token")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status=%d", res.StatusCode)
	}
	if res.Header.Get("X-Test") != "1" {
		t.Fatalf("missing upstream header")
	}
	data, _ := io.ReadAll(res.Body)
	if string(data) != "payload" {
		t.Fatalf("body=%q", string(data))
	}
}

func TestHandleHealthAndVersion(t *testing.T) {
	s := NewServer("secret-token", 4)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	for _, path := range []string{"/health", "/version", "/status"} {
		req, _ := http.NewRequest(http.MethodGet, ts.URL+path, nil)
		req.Header.Set(headerWorkerToken, "secret-token")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusOK {
			t.Fatalf("%s status=%d", path, res.StatusCode)
		}
	}
}

func TestExecuteEndpointLoadShedding(t *testing.T) {
	block := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-block
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	s := NewServer("secret-token", 1)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	spec := protocol.ExecutionSpec{
		RequestID: "r-overload",
		Method:    http.MethodGet,
		URL:       upstream.URL,
		Egress:    protocol.EgressSpec{Mode: "direct", Generation: 1},
	}
	body, _ := json.Marshal(spec)

	holdStarted := make(chan struct{})
	go func() {
		req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/execute", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(headerWorkerToken, "secret-token")
		close(holdStarted)
		res, err := http.DefaultClient.Do(req)
		if err == nil {
			res.Body.Close()
		}
	}()
	<-holdStarted
	time.Sleep(30 * time.Millisecond)

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(headerWorkerToken, "secret-token")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503", res.StatusCode)
	}
	close(block)
}

func TestExecuteEndpointStreamingSSE(t *testing.T) {
	chunks := []string{
		"data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\n\n",
		"data: {\"choices\":[{\"delta\":{\"content\":\"b\"}}]}\n\n",
		"data: [DONE]\n\n",
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher, _ := w.(http.Flusher)
		for _, c := range chunks {
			_, _ = w.Write([]byte(c))
			if flusher != nil {
				flusher.Flush()
			}
			time.Sleep(5 * time.Millisecond)
		}
	}))
	defer upstream.Close()

	s := NewServer("secret-token", 8)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	spec := protocol.ExecutionSpec{
		RequestID:  "r-stream",
		Method:     http.MethodPost,
		URL:        upstream.URL,
		StreamMode: true,
		Egress:     protocol.EgressSpec{Mode: "direct", Generation: 1},
	}
	body, _ := json.Marshal(spec)

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(headerWorkerToken, "secret-token")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d", res.StatusCode)
	}
	if !strings.Contains(res.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("content-type=%q", res.Header.Get("Content-Type"))
	}

	var bodyBuf strings.Builder
	buf := make([]byte, 64)
	readCount := 0
	for {
		n, readErr := res.Body.Read(buf)
		if n > 0 {
			readCount++
			bodyBuf.Write(buf[:n])
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			t.Fatalf("read: %v", readErr)
		}
	}
	if readCount < 1 {
		t.Fatalf("expected reads while streaming, got %d", readCount)
	}
	out := bodyBuf.String()
	if !strings.Contains(out, "content") || !strings.Contains(out, "[DONE]") {
		t.Fatalf("body=%q", out)
	}
}
