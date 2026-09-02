package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestH2Unauthorized(t *testing.T) {
	s := NewServer("secret-token", 4)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/h2/open", bytes.NewReader([]byte(`{}`)))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401", res.StatusCode)
	}
}

func TestH2WriteAndEventsOnRegisteredStream(t *testing.T) {
	s := NewServer("secret-token", 4)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	_, cancel := context.WithCancel(context.Background())
	st := &h2Stream{
		id:       "test-stream",
		writeCh:  make(chan []byte, 4),
		readCh:   make(chan []byte, 4),
		headerCh: make(chan map[string]any, 1),
		errCh:    make(chan error, 1),
		done:     make(chan struct{}),
		cancel:   cancel,
	}
	h2Mu.Lock()
	h2Streams["test-stream"] = st
	h2Mu.Unlock()
	t.Cleanup(func() { closeH2Stream("test-stream") })

	wreq, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/h2/test-stream/write", bytes.NewReader([]byte("payload")))
	wreq.Header.Set(headerWorkerToken, "secret-token")
	wres, err := http.DefaultClient.Do(wreq)
	if err != nil {
		t.Fatal(err)
	}
	wres.Body.Close()
	if wres.StatusCode != http.StatusNoContent {
		t.Fatalf("write status=%d", wres.StatusCode)
	}

	select {
	case got := <-st.writeCh:
		if string(got) != "payload" {
			t.Fatalf("writeCh=%q", string(got))
		}
	default:
		t.Fatal("expected payload on writeCh")
	}

	eventsDone := make(chan string, 1)
	eventsReady := make(chan struct{})
	go func() {
		close(eventsReady)
		ereq, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/h2/test-stream/events", nil)
		ereq.Header.Set(headerWorkerToken, "secret-token")
		eres, err := http.DefaultClient.Do(ereq)
		if err != nil {
			eventsDone <- err.Error()
			return
		}
		defer eres.Body.Close()
		body, _ := io.ReadAll(eres.Body)
		eventsDone <- string(body)
	}()

	<-eventsReady
	time.Sleep(100 * time.Millisecond)

	st.headerCh <- map[string]any{":status": 200}
	st.readCh <- []byte("frame-a")
	close(st.done)

	text := <-eventsDone
	if !strings.Contains(text, `"type":"response"`) {
		t.Fatalf("missing response event: %s", text)
	}
	if !strings.Contains(text, `"type":"data"`) {
		t.Fatalf("missing data event: %s", text)
	}
	if !strings.Contains(text, `"type":"end"`) {
		t.Fatalf("missing end event: %s", text)
	}
}

func TestH2OpenReturnsStreamID(t *testing.T) {
	s := NewServer("secret-token", 4)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	openBody, _ := json.Marshal(map[string]any{
		"requestId": "open-only",
		"url":       "https://example.invalid/no-connect",
		"headers":   map[string]string{},
		"egress":    map[string]string{"mode": "direct"},
	})
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/h2/open", bytes.NewReader(openBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(headerWorkerToken, "secret-token")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("open status=%d", res.StatusCode)
	}
	var openResp struct {
		StreamID string `json:"streamId"`
	}
	if err := json.NewDecoder(res.Body).Decode(&openResp); err != nil {
		t.Fatal(err)
	}
	if openResp.StreamID != "open-only" {
		t.Fatalf("streamId=%q", openResp.StreamID)
	}
}
