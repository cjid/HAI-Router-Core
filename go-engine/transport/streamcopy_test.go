package transport

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestShouldUseStreamingCopy(t *testing.T) {
	tests := []struct {
		name        string
		streamMode  bool
		contentType string
		want        bool
	}{
		{"stream mode flag", true, "application/json", true},
		{"sse content type", false, "text/event-stream; charset=utf-8", true},
		{"ndjson content type", false, "application/x-ndjson", true},
		{"json non-stream", false, "application/json", false},
		{"empty content type", false, "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ShouldUseStreamingCopy(tt.streamMode, tt.contentType); got != tt.want {
				t.Fatalf("ShouldUseStreamingCopy() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCopyStreamingResponseTinyChunks(t *testing.T) {
	rec := httptest.NewRecorder()
	payload := "data: hello\n\n"
	stats, err := CopyStreamingResponse(rec, strings.NewReader(payload))
	if err != nil {
		t.Fatalf("copy: %v", err)
	}
	if stats.BytesWritten != int64(len(payload)) {
		t.Fatalf("bytes=%d want=%d", stats.BytesWritten, len(payload))
	}
	if stats.FlushCount < 1 {
		t.Fatalf("expected at least one flush, got %d", stats.FlushCount)
	}
	if rec.Body.String() != payload {
		t.Fatalf("body=%q", rec.Body.String())
	}
}

type smallReadSource struct {
	data []byte
	off  int
}

func (s *smallReadSource) Read(p []byte) (int, error) {
	if s.off >= len(s.data) {
		return 0, io.EOF
	}
	n := 1
	if n > len(p) {
		n = len(p)
	}
	if s.off+n > len(s.data) {
		n = len(s.data) - s.off
	}
	copy(p, s.data[s.off:s.off+n])
	s.off += n
	if s.off >= len(s.data) {
		return n, io.EOF
	}
	return n, nil
}

func TestCopyStreamingResponseForwardsSmallReadsImmediately(t *testing.T) {
	rec := httptest.NewRecorder()
	payload := []byte("data: x\n\n")
	stats, err := CopyStreamingResponseWithBuffer(rec, &smallReadSource{data: payload}, 4096)
	if err != nil {
		t.Fatalf("copy: %v", err)
	}
	if stats.BytesWritten != int64(len(payload)) {
		t.Fatalf("bytes=%d want=%d", stats.BytesWritten, len(payload))
	}
	if stats.FlushCount < int64(len(payload)) {
		t.Fatalf("expected per-byte flushes, got %d", stats.FlushCount)
	}
}

func TestCopyStreamingResponseEOF(t *testing.T) {
	rec := httptest.NewRecorder()
	stats, err := CopyStreamingResponse(rec, strings.NewReader(""))
	if err != nil {
		t.Fatalf("eof copy: %v", err)
	}
	if stats.BytesWritten != 0 {
		t.Fatalf("bytes=%d", stats.BytesWritten)
	}
}

func TestCopyStreamingResponseReadError(t *testing.T) {
	rec := httptest.NewRecorder()
	_, err := CopyStreamingResponse(rec, errReader{errors.New("read failed")})
	if err == nil {
		t.Fatal("expected read error")
	}
}

type errReader struct{ err error }

func (e errReader) Read([]byte) (int, error) { return 0, e.err }

type pipeResponseWriter struct {
	rec *httptest.ResponseRecorder
	pw  *io.PipeWriter
}

func (p *pipeResponseWriter) Header() http.Header         { return p.rec.Header() }
func (p *pipeResponseWriter) WriteHeader(statusCode int)  { p.rec.WriteHeader(statusCode) }
func (p *pipeResponseWriter) Write(b []byte) (int, error) { return p.pw.Write(b) }
func (p *pipeResponseWriter) Flush()                      {}

func TestCopyStreamingResponseBackpressure(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pr, pw := io.Pipe()
	reads := atomic.Int64{}
	src := io.NopCloser(readerFunc(func(p []byte) (int, error) {
		if reads.Load() >= 8 {
			return 0, io.EOF
		}
		reads.Add(1)
		if len(p) == 0 {
			return 0, nil
		}
		p[0] = 'x'
		return 1, nil
	}))

	w := &pipeResponseWriter{rec: httptest.NewRecorder(), pw: pw}
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = CopyStreamingResponseWithBuffer(w, src, 1)
		_ = pw.Close()
	}()

	buf := make([]byte, 1)
	_, _ = pr.Read(buf)

	deadline := time.Now().Add(200 * time.Millisecond)
	for reads.Load() < 2 && time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			t.Fatal("timed out waiting for upstream reads")
		default:
			time.Sleep(5 * time.Millisecond)
		}
	}
	readsAtStall := reads.Load()
	_ = pr.Close()
	select {
	case <-done:
	case <-ctx.Done():
		t.Fatal("copy goroutine did not finish after downstream close")
	}
	if readsAtStall > 4 {
		t.Fatalf("upstream reads=%d without downstream drain indicates missing backpressure", readsAtStall)
	}
}

type readerFunc func([]byte) (int, error)

func (f readerFunc) Read(p []byte) (int, error) { return f(p) }

func TestCopyStreamingResponseLongStream(t *testing.T) {
	rec := httptest.NewRecorder()
	var b strings.Builder
	for i := 0; i < 500; i++ {
		b.WriteString("data: chunk\n\n")
	}
	stats, err := CopyStreamingResponse(rec, strings.NewReader(b.String()))
	if err != nil {
		t.Fatalf("long stream: %v", err)
	}
	if stats.BytesWritten != int64(b.Len()) {
		t.Fatalf("bytes=%d want=%d", stats.BytesWritten, b.Len())
	}
	if rec.Body.Len() != b.Len() {
		t.Fatalf("recorder len=%d want=%d", rec.Body.Len(), b.Len())
	}
}

func BenchmarkCopyStreamingBufferSizes(b *testing.B) {
	payload := strings.Repeat("data: token\n\n", 64)
	sizes := []struct {
		name string
		size int
	}{
		{"4KiB", 4096},
		{"8KiB", 8192},
		{"16KiB", 16384},
	}

	for _, sz := range sizes {
		b.Run(sz.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				rec := httptest.NewRecorder()
				_, _ = CopyStreamingResponseWithBuffer(rec, strings.NewReader(payload), sz.size)
			}
		})
	}
}

func BenchmarkBulkCopyVsStreamingCopy(b *testing.B) {
	payload := strings.Repeat("x", 127)
	b.Run("io.Copy", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			rec := httptest.NewRecorder()
			_, _ = io.Copy(rec, strings.NewReader(payload))
		}
	})
	b.Run("streamingCopy", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			rec := httptest.NewRecorder()
			_, _ = CopyStreamingResponseWithBuffer(rec, strings.NewReader(payload), 4096)
		}
	})
}
