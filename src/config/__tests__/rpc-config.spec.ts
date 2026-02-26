// Copyright (c) 2026 dotandev
// SPDX-License-Identifier: MIT OR Apache-2.0

import { RPCConfigParser } from '../rpc-config';

describe('RPCConfigParser', () => {
    describe('parseUrls', () => {
        it('should parse comma-separated string', () => {
            const input = 'https://rpc1.com,https://rpc2.com,https://rpc3.com';
            const result = RPCConfigParser.parseUrls(input);

            expect(result).toEqual([
                'https://rpc1.com',
                'https://rpc2.com',
                'https://rpc3.com',
            ]);
        });

        it('should handle whitespace in URLs', () => {
            const input = ' https://rpc1.com , https://rpc2.com ';
            const result = RPCConfigParser.parseUrls(input);

            expect(result).toEqual(['https://rpc1.com', 'https://rpc2.com']);
        });

        it('should filter out invalid URLs', () => {
            const input = 'https://valid.com,invalid-url,ftp://wrong.com';
            const result = RPCConfigParser.parseUrls(input);

            expect(result).toEqual(['https://valid.com']);
        });

        it('should accept array of URLs', () => {
            const input = ['https://rpc1.com', 'https://rpc2.com'];
            const result = RPCConfigParser.parseUrls(input);

            expect(result).toEqual(['https://rpc1.com', 'https://rpc2.com']);
        });

        it('should throw error if no valid URLs', () => {
            expect(() => RPCConfigParser.parseUrls('invalid')).toThrow('No valid RPC URLs');
        });
    });

    describe('isValidUrl', () => {
        it('should accept valid HTTPS URLs', () => {
            expect(RPCConfigParser.isValidUrl('https://example.com')).toBe(true);
        });

        it('should accept valid HTTP URLs', () => {
            expect(RPCConfigParser.isValidUrl('http://localhost:8080')).toBe(true);
        });

        it('should reject invalid URLs', () => {
            expect(RPCConfigParser.isValidUrl('not-a-url')).toBe(false);
            expect(RPCConfigParser.isValidUrl('ftp://wrong.com')).toBe(false);
        });
    });

    describe('parseHeaders', () => {
        it('should parse a simple JSON string', () => {
            const headers = RPCConfigParser.parseHeaders('{"A":"1","B":2}');
            expect(headers).toEqual({ A: '1', B: '2' });
        });

        it('should parse comma-separated key=value pairs', () => {
            const headers = RPCConfigParser.parseHeaders('X=1,Y:2,Z=three');
            expect(headers).toEqual({ X: '1', Y: '2', Z: 'three' });
        });

        it('should ignore malformed segments', () => {
            const headers = RPCConfigParser.parseHeaders('X=1,notvalid,Y=2');
            expect(headers).toEqual({ X: '1', Y: '2' });
        });
    });

    describe('loadConfig', () => {
        const originalEnv = process.env;

        beforeEach(() => {
            jest.resetModules();
            process.env = { ...originalEnv };
        });

        afterAll(() => {
            process.env = originalEnv;
        });

        it('should load from options', () => {
            const config = RPCConfigParser.loadConfig({
                rpc: 'https://rpc1.com',
                timeout: 5000,
                retries: 5
            });

            expect(config.urls).toEqual(['https://rpc1.com']);
            expect(config.timeout).toBe(5000);
            expect(config.retries).toBe(5);
        });

        it('should load from environment variable', () => {
            process.env.STELLAR_RPC_URLS = 'https://env1.com,https://env2.com';
            const config = RPCConfigParser.loadConfig({});

            expect(config.urls).toEqual(['https://env1.com', 'https://env2.com']);
        });

        it('should use default values', () => {
            const config = RPCConfigParser.loadConfig({ rpc: 'https://rpc.com' });

            expect(config.timeout).toBe(30000);
            expect(config.retries).toBe(3);
            expect(config.retryDelay).toBe(1000);
        });

        it('should throw error if no RPC URLs configured', () => {
            delete process.env.STELLAR_RPC_URLS;
            expect(() => RPCConfigParser.loadConfig({})).toThrow('No RPC URLs configured');
        });

        it('should carry headers through from options when provided as object', () => {
            const headers = { 'X-Auth': 'abc', 'X-Test': '123' };
            const config = RPCConfigParser.loadConfig({ rpc: 'https://rpc.com', headers });
            expect(config.headers).toEqual(headers);
        });

        it('should parse headers from options when provided as JSON string', () => {
            const json = JSON.stringify({ 'X-Auth': 'abc' });
            const config = RPCConfigParser.loadConfig({ rpc: 'https://rpc.com', headers: json });
            expect(config.headers).toEqual({ 'X-Auth': 'abc' });
        });

        it('should parse comma-separated headers from options', () => {
            const config = RPCConfigParser.loadConfig({ rpc: 'https://rpc.com', headers: 'X-Auth=abc, X-Test:123' });
            expect(config.headers).toEqual({ 'X-Auth': 'abc', 'X-Test': '123' });
        });

        it('should load headers from STELLAR_RPC_HEADERS env var', () => {
            process.env.STELLAR_RPC_HEADERS = 'X-Env=foo,X-Other=bar';
            const config = RPCConfigParser.loadConfig({ rpc: 'https://rpc.com' });
            expect(config.headers).toEqual({ 'X-Env': 'foo', 'X-Other': 'bar' });
        });
    });
});
