import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('VLESS Worker', () => {
	describe('Config Module', () => {
		it('returns default UUID when not set in env', async () => {
			const request = new IncomingRequest('http://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain('86c50e3a-5b87-49dd-bd20-03c7f2735e40');
		});

		it('returns custom UUID from env', async () => {
			const customEnv = { ...env, uuid: 'custom-uuid-12345' };
			const request = new IncomingRequest('http://example.com/custom-uuid-12345');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, customEnv, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain('custom-uuid-12345');
		});
	});

	describe('Subscription Routes', () => {
		it('returns base64 share link for /{uuid}/ty', async () => {
			const request = new IncomingRequest('http://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40/ty');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/plain;charset=utf-8');
			// Base64 encoded content should start with dmxl
			const text = await response.text();
			expect(text).toMatch(/^[a-zA-Z0-9+/=]+$/);
		});

		it('returns clash config for /{uuid}/cl', async () => {
			const request = new IncomingRequest('http://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40/cl');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain('proxies:');
			expect(text).toContain('proxy-groups:');
		});

		it('returns sing-box config for /{uuid}/sb', async () => {
			const request = new IncomingRequest('http://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40/sb');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain('"outbounds":');
			expect(text).toContain('"route":');
		});

		it('returns TLS-only share link for /{uuid}/pty', async () => {
			const request = new IncomingRequest('http://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40/pty');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/plain;charset=utf-8');
		});

		it('returns TLS-only clash config for /{uuid}/pcl', async () => {
			const request = new IncomingRequest('http://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40/pcl');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain('proxies:');
		});

		it('returns TLS-only sing-box config for /{uuid}/psb', async () => {
			const request = new IncomingRequest('http://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40/psb');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain('"outbounds":');
		});
	});

	describe('Config Page', () => {
		it('returns HTML config page for /{uuid}', async () => {
			const request = new IncomingRequest('http://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toContain('text/html');
			const text = await response.text();
			expect(text).toContain('VLESS');
			expect(text).toContain('版本');
		});

		it('returns different content for workers.dev domain', async () => {
			const request = new IncomingRequest('http://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40', {
				headers: { Host: 'test.workers.dev' }
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			const text = await response.text();
			// Workers.dev should show both TLS and non-TLS nodes
			expect(text).toContain('WS节点');
		});
	});

	describe('Debug Route', () => {
		it('returns CF info for unknown routes', async () => {
			const request = new IncomingRequest('http://example.com/unknown');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			// In test environment, cf object may be empty or partial
			const text = await response.text();
			// Should return JSON (may be empty object in test environment)
			expect(text).toMatch(/^\{.*\}$/s);
		});
	});

	describe('Integration Tests', () => {
		it('responds with config page (integration style)', async () => {
			const response = await SELF.fetch('https://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40');
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain('VLESS');
		});

		it('responds with share link (integration style)', async () => {
			const response = await SELF.fetch('https://example.com/86c50e3a-5b87-49dd-bd20-03c7f2735e40/ty');
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toMatch(/^[a-zA-Z0-9+/=]+$/);
		});
	});
});
