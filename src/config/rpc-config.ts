// Copyright (c) 2026 dotandev
// SPDX-License-Identifier: MIT OR Apache-2.0

import { URL } from 'url';

export interface RPCConfig {
    urls: string[];
    timeout: number;
    retries: number;
    retryDelay: number;
    circuitBreakerThreshold: number;
    circuitBreakerTimeout: number;
    maxRedirects: number;
    headers?: Record<string, string>;
}

export class RPCConfigParser {
    /**
     * Parse RPC URLs from comma-separated string or array
     */
    static parseUrls(input: string | string[]): string[] {
        const urls: string[] = [];

        if (Array.isArray(input)) {
            urls.push(...input);
        } else if (typeof input === 'string') {
            // Split by comma and trim whitespace
            urls.push(...input.split(',').map(url => url.trim()));
        }

        // Validate each URL
        const validUrls = urls.filter(url => this.isValidUrl(url));

        if (validUrls.length === 0) {
            throw new Error('No valid RPC URLs provided');
        }

        return validUrls;
    }

    /**
     * Parse headers from a JSON string or comma-separated list of key=value pairs.
     * This helper is used when loading configuration from the environment or CLI.
     */
    static parseHeaders(input: string): Record<string, string> {
        const headers: Record<string, string> = {};

        // attempt JSON parse first
        try {
            const obj = JSON.parse(input);
            if (obj && typeof obj === 'object') {
                for (const [key, value] of Object.entries(obj as Record<string, any>)) {
                    headers[key] = String(value);
                }
                return headers;
            }
        } catch {
            // fall through to simple parsing
        }

        // comma-separated list of key=value or key:value pairs
        input.split(',').forEach(pair => {
            const sepIdx = pair.indexOf('=') !== -1 ? pair.indexOf('=') : pair.indexOf(':');
            if (sepIdx === -1) {
                return;
            }
            const key = pair.slice(0, sepIdx).trim();
            const value = pair.slice(sepIdx + 1).trim();
            if (key && value) {
                headers[key] = value;
            }
        });

        return headers;
    }

    /**
     * Validate URL format
     */
    static isValidUrl(urlString: string): boolean {
        try {
            const url = new URL(urlString);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            console.warn(`[WARN]  Invalid RPC URL skipped: ${urlString}`);
            return false;
        }
    }

    /**
     * Load RPC configuration from environment and CLI args
     */
    static loadConfig(options: {
        rpc?: string | string[];
        timeout?: number;
        retries?: number;
        /**
         * Additional headers to send with each RPC request.  Can be provided as a
         * string (JSON or key=value list) or as a record when called programmatically.
         */
        headers?: Record<string, string> | string;
    }): RPCConfig {
        // Get URLs from CLI args or environment variable
        const urlInput = options.rpc || process.env.STELLAR_RPC_URLS;

        if (!urlInput) {
            throw new Error('No RPC URLs configured. Use --rpc flag or STELLAR_RPC_URLS env variable');
        }

        const urls = this.parseUrls(urlInput);

        // determine headers from options or environment
        let headers: Record<string, string> | undefined = undefined;
        if (options.headers) {
            if (typeof options.headers === 'string') {
                headers = this.parseHeaders(options.headers);
            } else {
                headers = options.headers;
            }
        } else if (process.env.STELLAR_RPC_HEADERS) {
            headers = this.parseHeaders(process.env.STELLAR_RPC_HEADERS);
        }

        const cfg: RPCConfig = {
            urls,
            timeout: options.timeout || 30000, // 30 seconds
            retries: options.retries || 3,
            retryDelay: 1000, // 1 second
            circuitBreakerThreshold: 5,
            circuitBreakerTimeout: 60000, // 1 minute
            maxRedirects: 5,
        };

        if (headers && Object.keys(headers).length > 0) {
            cfg.headers = headers;
        }

        return cfg;
    }
}
