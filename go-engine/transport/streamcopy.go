package transport

import (
	"errors"
	"io"
	"net/http"
)

const DefaultStreamCopyBuffer = 4096

// StreamCopyStats aggregates low-level streaming copy metrics.
type StreamCopyStats struct {
	BytesWritten int64
	FlushCount   int64
}

// CopyStreamingResponse forwards upstream bytes promptly with flush-after-write.
// Preserves natural backpressure: blocked downstream writes stall upstream reads.
func CopyStreamingResponse(w http.ResponseWriter, src io.Reader) (StreamCopyStats, error) {
	return CopyStreamingResponseWithBuffer(w, src, DefaultStreamCopyBuffer)
}

// CopyStreamingResponseWithBuffer allows benchmarked buffer sizing.
func CopyStreamingResponseWithBuffer(w http.ResponseWriter, src io.Reader, bufSize int) (StreamCopyStats, error) {
	if bufSize <= 0 {
		bufSize = DefaultStreamCopyBuffer
	}
	buf := make([]byte, bufSize)
	var stats StreamCopyStats

	rc := http.NewResponseController(w)
	flusher, hasFlusher := w.(http.Flusher)

	for {
		n, readErr := src.Read(buf)
		if n > 0 {
			written, writeErr := w.Write(buf[:n])
			stats.BytesWritten += int64(written)
			if writeErr != nil {
				return stats, writeErr
			}
			if written != n {
				return stats, io.ErrShortWrite
			}
			if err := rc.Flush(); err != nil {
				if errors.Is(err, http.ErrNotSupported) && hasFlusher {
					flusher.Flush()
					stats.FlushCount++
				} else {
					return stats, err
				}
			} else {
				stats.FlushCount++
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				return stats, nil
			}
			return stats, readErr
		}
	}
}
