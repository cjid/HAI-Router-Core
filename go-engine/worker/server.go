package worker

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/cjid/hai-router/go-engine/protocol"
	"github.com/cjid/hai-router/go-engine/transport"
)

const (
	headerWorkerToken = "X-HAI-Worker-Token"
	maxBodyBytes      = 32 << 20 // 32 MiB request body cap
)

// Server is the loopback IPC HTTP server for provider transport execution.
type Server struct {
	authToken string
	client    *transport.Client
	limiter   *Limiter
	mux       *http.ServeMux
	startedAt time.Time
}

func NewServer(authToken string, maxInflight int) *Server {
	s := &Server{
		authToken: authToken,
		client:    transport.NewClient(),
		limiter:   NewLimiter(maxInflight),
		mux:       http.NewServeMux(),
		startedAt: time.Now(),
	}
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("GET /version", s.handleVersion)
	s.mux.HandleFunc("GET /status", s.handleStatus)
	s.mux.HandleFunc("POST /v1/execute", s.handleExecute)
	s.mux.HandleFunc("POST /v1/h2/open", s.handleH2Open)
	s.mux.HandleFunc("POST /v1/h2/{id}/write", s.handleH2Write)
	s.mux.HandleFunc("POST /v1/h2/{id}/close", s.handleH2Close)
	s.mux.HandleFunc("GET /v1/h2/{id}/events", s.handleH2Events)
	return s
}

func (s *Server) Handler() http.Handler { return s.mux }

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"ok":true}`))
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	payload, _ := json.Marshal(map[string]string{
		"protocol": protocol.ProtocolVersion,
		"worker":   protocol.WorkerVersion,
	})
	_, _ = w.Write(payload)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	payload, _ := json.Marshal(map[string]any{
		"ok":             true,
		"activeRequests": s.limiter.Active(),
		"maxInflight":    s.limiter.Max(),
		"uptimeMs":       time.Since(s.startedAt).Milliseconds(),
	})
	_, _ = w.Write(payload)
}

func (s *Server) authorize(r *http.Request) bool {
	got := r.Header.Get(headerWorkerToken)
	if got == "" || s.authToken == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(s.authToken)) == 1
}

func (s *Server) handleExecute(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if err := s.limiter.TryAcquire(); err != nil {
		writeWorkerError(w, http.StatusServiceUnavailable, "hai_worker_overloaded", err.Error(), true)
		return
	}
	defer s.limiter.Release()

	ctx := r.Context()

	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	defer r.Body.Close()

	var spec protocol.ExecutionSpec
	if err := json.NewDecoder(r.Body).Decode(&spec); err != nil {
		writeWorkerError(w, http.StatusBadRequest, "hai_invalid_spec", "invalid execution spec", false)
		return
	}

	if spec.Method == "" {
		spec.Method = http.MethodPost
	}
	if spec.URL == "" {
		writeWorkerError(w, http.StatusBadRequest, "hai_invalid_spec", "missing url", false)
		return
	}

	timeout := time.Duration(spec.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 120 * time.Second
	}

	start := time.Now()
	// StreamMode: timeout caps header/first-byte only (ResponseHeaderTimeout).
	// Body copy is bounded by client cancel (r.Context()), not a post-header deadline.
	execCtx := ctx
	var execCancel context.CancelFunc
	if !spec.StreamMode {
		execCtx, execCancel = context.WithTimeout(ctx, timeout)
	}
	if execCancel != nil {
		defer execCancel()
	}

	var resp *http.Response
	var err error
	if spec.StreamMode {
		resp, err = s.client.ExecuteWithSafeRetryHeaderTimeout(execCtx, spec.Method, spec.URL, spec.Headers, spec.Body, spec.Egress, timeout)
	} else {
		resp, err = s.client.ExecuteWithSafeRetry(execCtx, spec.Method, spec.URL, spec.Headers, spec.Body, spec.Egress)
	}
	connectMs := time.Since(start).Milliseconds()

	if err != nil {
		if spec.Egress.Strict && (spec.Egress.Mode == "proxy" || spec.Egress.Mode == "relay") {
			writeWorkerError(w, http.StatusBadGateway, "hai_proxy_failed", sanitizeErr(err), false)
			return
		}
		writeWorkerError(w, http.StatusBadGateway, "hai_transport_failed", sanitizeErr(err), false)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("X-HAI-Transport-Connect-Ms", strconv.FormatInt(connectMs, 10))
	w.Header().Set("X-HAI-Transport-Protocol", protocol.ProtocolVersion)
	copyHeader(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)

	if transport.ShouldUseStreamingCopy(spec.StreamMode, resp.Header.Get("Content-Type")) {
		if _, copyErr := transport.CopyStreamingResponse(w, resp.Body); copyErr != nil && copyErr != io.EOF {
			log.Printf("[hai-worker] stream copy error request=%s err=%v", spec.RequestID, sanitizeErr(copyErr))
		}
		return
	}
	_, _ = io.Copy(w, resp.Body)
}

func copyHeader(dst, src http.Header) {
	for k, vals := range src {
		if isHopByHopHeader(k) {
			continue
		}
		for _, v := range vals {
			dst.Add(k, v)
		}
	}
}

func isHopByHopHeader(k string) bool {
	switch strings.ToLower(k) {
	case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade":
		return true
	default:
		return false
	}
}

func writeWorkerError(w http.ResponseWriter, status int, code, msg string, retry bool) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(protocol.ErrorBody{Code: code, Message: msg, Retry: retry})
}

func sanitizeErr(err error) string {
	if err == nil {
		return "unknown transport error"
	}
	msg := err.Error()
	// Never leak proxy credentials from URLs in errors.
	if i := strings.Index(msg, "@"); i > 0 {
		return "transport error (details redacted)"
	}
	return msg
}

// ListenAndServe starts the worker on loopback only.
func ListenAndServe(addr string, s *Server) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	host, port, _ := net.SplitHostPort(ln.Addr().String())
	log.Printf("HAI_WORKER_READY addr=%s protocol=%s worker=%s", ln.Addr().String(), protocol.ProtocolVersion, protocol.WorkerVersion)
	log.Printf("[hai-worker] listening host=%s port=%s", host, port)
	srv := &http.Server{
		Handler:           s.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       0,
		WriteTimeout:      0,
		IdleTimeout:       120 * time.Second,
	}
	return srv.Serve(ln)
}

// AddrFromEnv resolves bind address (loopback only).
func AddrFromEnv() string {
	host := os.Getenv("HAI_WORKER_HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	if host != "127.0.0.1" && host != "localhost" && host != "::1" {
		host = "127.0.0.1"
	}
	port := os.Getenv("HAI_WORKER_PORT")
	if port == "" {
		port = "0"
	}
	return net.JoinHostPort(host, port)
}
