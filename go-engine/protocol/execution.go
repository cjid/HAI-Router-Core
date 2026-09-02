package protocol

// EgressSpec is an immutable egress snapshot decided by Node (SSOT).
type EgressSpec struct {
	Mode       string `json:"mode"` // direct | proxy | relay | bypass
	ProxyURL   string `json:"proxyUrl,omitempty"`
	NoProxy    bool   `json:"noProxy,omitempty"`
	RelayURL   string `json:"relayUrl,omitempty"`
	BypassHost string `json:"bypassHost,omitempty"`
	BypassIP   string `json:"bypassIp,omitempty"`
	Strict     bool   `json:"strict"`
	Identity   string `json:"identity,omitempty"`
	Generation int64  `json:"generation"`
}

// ExecutionSpec describes one provider-facing HTTP execution (immutable after send).
type ExecutionSpec struct {
	RequestID    string            `json:"requestId"`
	ProviderID   string            `json:"providerId"`
	ConnectionID string            `json:"connectionId"`
	Method       string            `json:"method"`
	URL          string            `json:"url"`
	Headers      map[string]string `json:"headers"`
	Body         string            `json:"body,omitempty"`
	StreamMode   bool              `json:"streamMode"`
	Egress       EgressSpec        `json:"egress"`
	TimeoutMs    int64             `json:"timeoutMs"`
}

// ErrorBody is returned for worker-local failures (not upstream semantics).
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Retry   bool   `json:"retry,omitempty"`
}
