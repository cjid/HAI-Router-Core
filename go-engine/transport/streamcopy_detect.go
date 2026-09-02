package transport

import (
	"strings"
)

// IsStreamingContentType reports whether the upstream response should use flush-aware copy.
func IsStreamingContentType(contentType string) bool {
	ct := strings.ToLower(contentType)
	if strings.Contains(ct, "text/event-stream") {
		return true
	}
	if strings.Contains(ct, "application/x-ndjson") {
		return true
	}
	if strings.Contains(ct, "application/octet-stream") {
		return true
	}
	return false
}

// ShouldUseStreamingCopy decides flush-aware forwarding for worker execute responses.
func ShouldUseStreamingCopy(streamMode bool, contentType string) bool {
	if streamMode {
		return true
	}
	return IsStreamingContentType(contentType)
}
