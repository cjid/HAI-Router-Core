package worker

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/cjid/hai-router/go-engine/protocol"
)

func TestExecuteConcurrentLoad(t *testing.T) {
	if testing.Short() {
		t.Skip("stress test")
	}

	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	s := NewServer("stress-token", 32)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	spec := protocol.ExecutionSpec{
		RequestID: "stress",
		Method:    http.MethodGet,
		URL:       upstream.URL,
		Egress:    protocol.EgressSpec{Mode: "direct", Generation: 1},
	}
	body, _ := json.Marshal(spec)

	const workers = 24
	const perWorker = 8
	var wg sync.WaitGroup
	errCh := make(chan error, workers*perWorker)

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < perWorker; i++ {
				req, err := http.NewRequest(http.MethodPost, ts.URL+"/v1/execute", bytes.NewReader(body))
				if err != nil {
					errCh <- err
					return
				}
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set(headerWorkerToken, "stress-token")
				res, err := http.DefaultClient.Do(req)
				if err != nil {
					errCh <- err
					return
				}
				res.Body.Close()
				if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusServiceUnavailable {
					errCh <- fmt.Errorf("unexpected status %d", res.StatusCode)
				}
			}
		}()
	}

	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			t.Fatal(err)
		}
	}
	if hits.Load() == 0 {
		t.Fatal("expected upstream hits")
	}
}
