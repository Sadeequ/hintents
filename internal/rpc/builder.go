// Copyright 2025 Erst Users
// SPDX-License-Identifier: Apache-2.0

package rpc

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/dotandev/hintents/internal/errors"
	"github.com/stellar/go-stellar-sdk/clients/horizonclient"
)

type ClientOption func(*clientBuilder) error

type clientBuilder struct {
	network        Network
	token          string
	horizonURL     string
	sorobanURL     string
	altURLs        []string
	cacheEnabled   bool
	config         *NetworkConfig
	httpClient     *http.Client
	requestTimeout time.Duration
	// custom headers to inject on each request
	headers         map[string]string
}

const defaultHTTPTimeout = 15 * time.Second

func newBuilder() *clientBuilder {
	return &clientBuilder{
		network:        Mainnet,
		cacheEnabled:   true,
		requestTimeout: defaultHTTPTimeout,
		headers:         make(map[string]string),
	}
}

func WithNetwork(net Network) ClientOption {
	return func(b *clientBuilder) error {
		if net == "" {
			net = Mainnet
		}
		b.network = net
		return nil
	}
}

func WithToken(token string) ClientOption {
	return func(b *clientBuilder) error {
		b.token = token
		return nil
	}
}

func WithHeaders(headers map[string]string) ClientOption {
	return func(b *clientBuilder) error {
		b.headers = headers
		return nil
	}
}

// ParseHeaders converts a string into a header map. The input may be a JSON
// object (e.g. '{"A":"1"}') or a comma-separated list of key=value or
// key:value pairs. Empty input returns an empty map.
func ParseHeaders(input string) map[string]string {
	headers := make(map[string]string)
	if input == "" {
		return headers
	}

	// try JSON first
	var obj map[string]string
	if err := json.Unmarshal([]byte(input), &obj); err == nil {
		return obj
	}

	for _, part := range strings.Split(input, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		idx := strings.IndexAny(part, "=:")
		if idx == -1 {
			continue
		}
		key := strings.TrimSpace(part[:idx])
		value := strings.TrimSpace(part[idx+1:])
		if key != "" && value != "" {
			headers[key] = value
		}
	}

	return headers
}

func WithHorizonURL(url string) ClientOption {
	return func(b *clientBuilder) error {
		if url != "" {
			if err := isValidURL(url); err != nil {
				return errors.WrapValidationError(fmt.Sprintf("invalid HorizonURL: %v", err))
			}
		}
		b.horizonURL = url
		b.altURLs = []string{url}
		return nil
	}
}

func WithAltURLs(urls []string) ClientOption {
	return func(b *clientBuilder) error {
		for _, url := range urls {
			if err := isValidURL(url); err != nil {
				return errors.WrapValidationError(fmt.Sprintf("invalid URL in altURLs: %v", err))
			}
		}
		if len(urls) > 0 {
			b.altURLs = urls
			b.horizonURL = urls[0]
		}
		return nil
	}
}

func WithSorobanURL(url string) ClientOption {
	return func(b *clientBuilder) error {
		if url != "" {
			if err := isValidURL(url); err != nil {
				return errors.WrapValidationError(fmt.Sprintf("invalid SorobanURL: %v", err))
			}
		}
		b.sorobanURL = url
		return nil
	}
}

func WithNetworkConfig(cfg NetworkConfig) ClientOption {
	return func(b *clientBuilder) error {
		if err := ValidateNetworkConfig(cfg); err != nil {
			return errors.WrapValidationError(fmt.Sprintf("invalid network config: %v", err))
		}
		b.config = &cfg
		b.network = Network(cfg.Name)
		b.horizonURL = cfg.HorizonURL
		b.sorobanURL = cfg.SorobanRPCURL
		return nil
	}
}

func WithCacheEnabled(enabled bool) ClientOption {
	return func(b *clientBuilder) error {
		b.cacheEnabled = enabled
		return nil
	}
}

// WithRequestTimeout sets a custom HTTP request timeout for all RPC calls.
// Use this to override the default 15-second timeout, for example on slow connections.
// A value of 0 disables the timeout (not recommended for production use).
func WithRequestTimeout(d time.Duration) ClientOption {
	return func(b *clientBuilder) error {
		b.requestTimeout = d
		return nil
	}
}

func WithHTTPClient(client *http.Client) ClientOption {
	return func(b *clientBuilder) error {
		b.httpClient = client
		return nil
	}
}

func NewClient(opts ...ClientOption) (*Client, error) {
	builder := newBuilder()

	if builder.token == "" {
		builder.token = os.Getenv("ERST_RPC_TOKEN")
	}

	for _, opt := range opts {
		if err := opt(builder); err != nil {
			return nil, err
		}
	}

	if err := builder.validate(); err != nil {
		return nil, err
	}

	return builder.build()
}

func (b *clientBuilder) validate() error {
	if b.network == "" {
		b.network = Mainnet
	}

	if b.horizonURL == "" && b.sorobanURL == "" {
		b.horizonURL = b.getDefaultHorizonURL(b.network)
	}

	return nil
}

func (b *clientBuilder) getDefaultHorizonURL(net Network) string {
	switch net {
	case Testnet:
		return TestnetHorizonURL
	case Futurenet:
		return FuturenetHorizonURL
	default:
		return MainnetHorizonURL
	}
}

func (b *clientBuilder) getDefaultSorobanURL(net Network) string {
	switch net {
	case Testnet:
		return TestnetSorobanURL
	case Futurenet:
		return FuturenetSorobanURL
	default:
		return MainnetSorobanURL
	}
}

func (b *clientBuilder) getConfig(net Network) NetworkConfig {
	switch net {
	case Testnet:
		return TestnetConfig
	case Futurenet:
		return FuturenetConfig
	default:
		return MainnetConfig
	}
}

func (b *clientBuilder) build() (*Client, error) {
	if b.sorobanURL == "" {
		b.sorobanURL = b.getDefaultSorobanURL(b.network)
	}

	if b.config == nil {
		cfg := b.getConfig(b.network)
		b.config = &cfg
	}

	if b.httpClient == nil {
		b.httpClient = createHTTPClient(b.token, b.headers, b.requestTimeout)
	}

	if len(b.altURLs) == 0 && b.horizonURL != "" {
		b.altURLs = []string{b.horizonURL}
	}

	if b.horizonURL == "" {
		b.horizonURL = b.config.HorizonURL
	}

	if len(b.altURLs) == 0 {
		b.altURLs = []string{b.horizonURL}
	}

	return &Client{
		HorizonURL: b.horizonURL,
		Horizon: &horizonclient.Client{
			HorizonURL: b.horizonURL,
			HTTP:       b.httpClient,
		},
		Network:      b.network,
		SorobanURL:   b.sorobanURL,
		AltURLs:      b.altURLs,
		httpClient:   b.httpClient,
		token:        b.token,
		Config:       *b.config,
		CacheEnabled: b.cacheEnabled,
		Headers:      b.headers,
		failures:     make(map[string]int),
		lastFailure:  make(map[string]time.Time),
	}, nil
}