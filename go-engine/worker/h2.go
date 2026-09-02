package worker

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/cjid/hai-router/go-engine/protocol"
	"golang.org/x/net/http2"
)

type h2Stream struct {
	id       string
	writeCh  chan []byte
	readCh   chan []byte
	headerCh chan map[string]any
	errCh    chan error
	done     chan struct{}
	cancel   context.CancelFunc
}

var (
	h2Mu      sync.Mutex
	h2Streams = map[string]*h2Stream{}
)

func (s *Server) handleH2Open(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var payload struct {
		RequestID string                `json:"requestId"`
		URL       string                `json:"url"`
		Headers   map[string]string     `json:"headers"`
		Egress    protocol.EgressSpec   `json:"egress"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeWorkerError(w, http.StatusBadRequest, "hai_invalid_spec", "invalid h2 open spec", false)
		return
	}
	if payload.URL == "" {
		writeWorkerError(w, http.StatusBadRequest, "hai_invalid_spec", "missing url", false)
		return
	}

	streamID := payload.RequestID
	if streamID == "" {
		streamID = fmt.Sprintf("h2-%d", time.Now().UnixNano())
	}

	ctx, cancel := context.WithCancel(r.Context())
	st := &h2Stream{
		id:       streamID,
		writeCh:  make(chan []byte, 32),
		readCh:   make(chan []byte, 32),
		headerCh: make(chan map[string]any, 1),
		errCh:    make(chan error, 1),
		done:     make(chan struct{}),
		cancel:   cancel,
	}

	h2Mu.Lock()
	h2Streams[streamID] = st
	h2Mu.Unlock()

	go s.runH2Stream(ctx, st, payload.URL, payload.Headers, payload.Egress)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"streamId": streamID})
}

func (s *Server) handleH2Write(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	streamID := r.PathValue("id")
	st := getH2Stream(streamID)
	if st == nil {
		writeWorkerError(w, http.StatusNotFound, "hai_stream_not_found", "stream not found", false)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		writeWorkerError(w, http.StatusBadRequest, "hai_invalid_body", "invalid write body", false)
		return
	}
	select {
	case st.writeCh <- body:
		w.WriteHeader(http.StatusNoContent)
	case <-st.done:
		writeWorkerError(w, http.StatusGone, "hai_stream_closed", "stream closed", false)
	case <-time.After(5 * time.Second):
		writeWorkerError(w, http.StatusServiceUnavailable, "hai_write_timeout", "write backpressure timeout", true)
	}
}

func (s *Server) handleH2Close(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	streamID := r.PathValue("id")
	closeH2Stream(streamID)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleH2Events(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	streamID := r.PathValue("id")
	st := getH2Stream(streamID)
	if st == nil {
		writeWorkerError(w, http.StatusNotFound, "hai_stream_not_found", "stream not found", false)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeWorkerError(w, http.StatusInternalServerError, "hai_sse_unsupported", "streaming unsupported", false)
		return
	}

	writeSSE := func(event map[string]any) {
		b, _ := json.Marshal(event)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
	}

	drainPending := func() {
		for {
			select {
			case hdr := <-st.headerCh:
				writeSSE(map[string]any{"type": "response", "headers": hdr})
			case chunk := <-st.readCh:
				writeSSE(map[string]any{"type": "data", "b64": base64.StdEncoding.EncodeToString(chunk)})
			default:
				return
			}
		}
	}

	for {
		select {
		case <-r.Context().Done():
			return
		case hdr := <-st.headerCh:
			writeSSE(map[string]any{"type": "response", "headers": hdr})
		case chunk := <-st.readCh:
			writeSSE(map[string]any{"type": "data", "b64": base64.StdEncoding.EncodeToString(chunk)})
		case err := <-st.errCh:
			writeSSE(map[string]any{"type": "error", "message": sanitizeErr(err)})
			return
		case <-st.done:
			drainPending()
			writeSSE(map[string]any{"type": "end"})
			return
		}
	}
}

func getH2Stream(id string) *h2Stream {
	h2Mu.Lock()
	defer h2Mu.Unlock()
	return h2Streams[id]
}

func closeH2Stream(id string) {
	h2Mu.Lock()
	st, ok := h2Streams[id]
	if ok {
		delete(h2Streams, id)
	}
	h2Mu.Unlock()
	if !ok || st == nil {
		return
	}
	if st.cancel != nil {
		st.cancel()
	}
	select {
	case <-st.done:
	default:
		close(st.done)
	}
}

func (s *Server) runH2Stream(ctx context.Context, st *h2Stream, rawURL string, headers map[string]string, egress protocol.EgressSpec) {
	defer closeH2Stream(st.id)

	u, err := url.Parse(rawURL)
	if err != nil {
		st.errCh <- err
		return
	}

	tlsConn, err := s.dialTLS(ctx, u.Hostname(), egress)
	if err != nil {
		st.errCh <- err
		return
	}
	defer tlsConn.Close()

	tr := &http2.Transport{}
	cc, err := tr.NewClientConn(tlsConn)
	if err != nil {
		st.errCh <- err
		return
	}
	defer cc.Close()

	pr, pw := io.Pipe()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rawURL, pr)
	if err != nil {
		st.errCh <- err
		return
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := cc.RoundTrip(req)
	if err != nil {
		st.errCh <- err
		return
	}
	defer resp.Body.Close()

	hdrOut := map[string]any{":status": resp.StatusCode}
	for k, vals := range resp.Header {
		if len(vals) == 1 {
			hdrOut[k] = vals[0]
		} else {
			hdrOut[k] = vals
		}
	}
	select {
	case st.headerCh <- hdrOut:
	default:
	}

	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, readErr := resp.Body.Read(buf)
			if n > 0 {
				chunk := make([]byte, n)
				copy(chunk, buf[:n])
				select {
				case st.readCh <- chunk:
				case <-ctx.Done():
					return
				}
			}
			if readErr != nil {
				if readErr != io.EOF {
					select {
					case st.errCh <- readErr:
					default:
					}
				}
				select {
				case <-st.done:
				default:
					close(st.done)
				}
				return
			}
		}
	}()

	go func() {
		for {
			select {
			case <-ctx.Done():
				_ = pw.Close()
				return
			case data, ok := <-st.writeCh:
				if !ok {
					_ = pw.Close()
					return
				}
				if _, werr := pw.Write(data); werr != nil {
					select {
					case st.errCh <- werr:
					default:
					}
					return
				}
			}
		}
	}()

	<-st.done
}

func (s *Server) dialTLS(ctx context.Context, hostname string, egress protocol.EgressSpec) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: 30 * time.Second}

	switch egress.Mode {
	case "proxy":
		if egress.ProxyURL == "" {
			return nil, fmt.Errorf("proxy mode requires proxyUrl")
		}
		return connectTLSViaProxy(ctx, dialer, egress.ProxyURL, hostname)
	default:
		conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(hostname, "443"))
		if err != nil {
			return nil, err
		}
		tlsConn := tls.Client(conn, &tls.Config{ServerName: hostname, MinVersion: tls.VersionTLS12, NextProtos: []string{"h2"}})
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			_ = conn.Close()
			return nil, err
		}
		return tlsConn, nil
	}
}

func connectTLSViaProxy(ctx context.Context, dialer *net.Dialer, proxyURL, targetHost string) (net.Conn, error) {
	parsed, err := url.Parse(proxyURL)
	if err != nil {
		return nil, err
	}
	proxyPort := parsed.Port()
	if proxyPort == "" {
		if parsed.Scheme == "https" {
			proxyPort = "443"
		} else {
			proxyPort = "80"
		}
	}
	conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(parsed.Hostname(), proxyPort))
	if err != nil {
		return nil, err
	}

	auth := ""
	if parsed.User != nil {
		pass, _ := parsed.User.Password()
		auth = base64.StdEncoding.EncodeToString([]byte(parsed.User.Username() + ":" + pass))
	}
	connectReq := fmt.Sprintf("CONNECT %s:443 HTTP/1.1\r\nHost: %s:443\r\n", targetHost, targetHost)
	if auth != "" {
		connectReq += "Proxy-Authorization: Basic " + auth + "\r\n"
	}
	connectReq += "\r\n"
	if _, err := conn.Write([]byte(connectReq)); err != nil {
		_ = conn.Close()
		return nil, err
	}

	buf := make([]byte, 4096)
	n, err := conn.Read(buf)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	statusLine := strings.Split(string(buf[:n]), "\r\n")[0]
	if !strings.Contains(statusLine, " 200 ") {
		_ = conn.Close()
		return nil, fmt.Errorf("proxy CONNECT failed: %s", strings.TrimSpace(statusLine))
	}

	tlsConn := tls.Client(conn, &tls.Config{ServerName: targetHost, MinVersion: tls.VersionTLS12, NextProtos: []string{"h2"}})
	if err := tlsConn.HandshakeContext(ctx); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return tlsConn, nil
}
