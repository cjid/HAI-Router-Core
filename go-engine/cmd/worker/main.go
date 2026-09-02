package main

import (
	"log"
	"os"
	"strconv"

	"github.com/cjid/hai-router/go-engine/worker"
)

func main() {
	token := os.Getenv("HAI_WORKER_AUTH_TOKEN")
	if token == "" {
		log.Fatal("[hai-worker] HAI_WORKER_AUTH_TOKEN is required")
	}

	maxInflight := 256
	if v := os.Getenv("HAI_WORKER_MAX_INFLIGHT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxInflight = n
		}
	}

	s := worker.NewServer(token, maxInflight)
	addr := worker.AddrFromEnv()
	if err := worker.ListenAndServe(addr, s); err != nil {
		log.Fatalf("[hai-worker] server failed: %v", err)
	}
}
