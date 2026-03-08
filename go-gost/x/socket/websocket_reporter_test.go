package socket

import (
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func TestBuildWebSocketCandidatesSecureFirst(t *testing.T) {
	candidates := buildWebSocketCandidates("panel.example.com:443", "abc", "2.0.2", 1, 0, 1, "")

	if len(candidates) != 2 {
		t.Fatalf("expected 2 candidates, got %d", len(candidates))
	}
	if !strings.HasPrefix(candidates[0], "wss://") {
		t.Fatalf("expected first candidate to start with wss://, got %s", candidates[0])
	}
	if !strings.HasPrefix(candidates[1], "ws://") {
		t.Fatalf("expected second candidate to start with ws://, got %s", candidates[1])
	}
}

func TestBuildWebSocketCandidatesUsesPreferredScheme(t *testing.T) {
	candidates := buildWebSocketCandidates("panel.example.com:443", "abc", "2.0.2", 1, 0, 1, "ws")

	if len(candidates) != 2 {
		t.Fatalf("expected 2 candidates, got %d", len(candidates))
	}
	if !strings.HasPrefix(candidates[0], "ws://") {
		t.Fatalf("expected preferred ws:// candidate first, got %s", candidates[0])
	}
	if !strings.HasPrefix(candidates[1], "wss://") {
		t.Fatalf("expected fallback wss:// candidate second, got %s", candidates[1])
	}
}

func TestBuildWebSocketCandidatesNormalizesSchemePrefixedAddr(t *testing.T) {
	candidates := buildWebSocketCandidates("https://panel.example.com:443/path?q=1", "abc", "2.0.2", 0, 0, 0, "")

	if len(candidates) != 2 {
		t.Fatalf("expected 2 candidates, got %d", len(candidates))
	}
	if !strings.HasPrefix(candidates[0], "wss://panel.example.com:443/") {
		t.Fatalf("expected normalized wss candidate, got %s", candidates[0])
	}
	if !strings.HasPrefix(candidates[1], "ws://panel.example.com:443/") {
		t.Fatalf("expected normalized ws fallback candidate, got %s", candidates[1])
	}
}

func TestDialWebSocketWithFallbackTriesWSAfterWSSFailure(t *testing.T) {
	orig := wsDial
	defer func() { wsDial = orig }()

	var attempts []string
	wsDial = func(_ *websocket.Dialer, rawURL string) (*websocket.Conn, *http.Response, error) {
		attempts = append(attempts, rawURL)
		if strings.HasPrefix(rawURL, "wss://") {
			return nil, nil, errors.New("tls failed")
		}
		return &websocket.Conn{}, nil, nil
	}

	_, usedURL, err := dialWebSocketWithFallback(
		&websocket.Dialer{},
		[]string{
			"wss://panel.example.com/system-info?type=1&secret=abc",
			"ws://panel.example.com/system-info?type=1&secret=abc",
		},
	)
	if err != nil {
		t.Fatalf("expected fallback success, got err=%v", err)
	}
	if !strings.HasPrefix(usedURL, "ws://") {
		t.Fatalf("expected fallback ws:// url, got %s", usedURL)
	}
	if len(attempts) != 2 {
		t.Fatalf("expected 2 attempts, got %d", len(attempts))
	}
	if !strings.HasPrefix(attempts[0], "wss://") || !strings.HasPrefix(attempts[1], "ws://") {
		t.Fatalf("unexpected attempt order: %#v", attempts)
	}
}

func TestDetectWebSocketScheme(t *testing.T) {
	if detectWebSocketScheme("wss://panel.example.com/system-info") != "wss" {
		t.Fatalf("expected wss detection")
	}
	if detectWebSocketScheme("ws://panel.example.com/system-info") != "ws" {
		t.Fatalf("expected ws detection")
	}
	if detectWebSocketScheme("http://panel.example.com/system-info") != "" {
		t.Fatalf("expected empty detection for non-websocket scheme")
	}
}
