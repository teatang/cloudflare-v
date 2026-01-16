import type { EnvConfig } from './types';
import { createConfig } from './config';
import { handleVlessWebSocket } from './websocket';
import {
	generateShareLink,
	generateClashConfig,
	generateSingBoxConfig,
	generateConfigPage,
} from './subscription';

interface Env extends EnvConfig {}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			const config = createConfig(env);
			const upgradeHeader = request.headers.get('Upgrade');
			const url = new URL(request.url);

			// Handle WebSocket upgrade for VLESS protocol
			if (upgradeHeader === 'websocket') {
				return await handleVlessWebSocket(request, config.userId);
			}

			// Handle HTTP requests for configuration pages and subscriptions
			const pathname = url.pathname;
			const userId = config.userId;

			// Route handling
			switch (pathname) {
				case `/${userId}`: {
					const html = generateConfigPage(
						config.userId,
						config.cdnIp,
						config.httpNodes,
						config.httpsNodes,
						request.headers.get('Host') || ''
					);
					return new Response(html, {
						status: 200,
						headers: {
							'Content-Type': 'text/html;charset=utf-8',
						},
					});
				}

				case `/${userId}/ty`: {
					const shareLink = generateShareLink(
						config.allNodes,
						config.userId,
						request.headers.get('Host') || ''
					);
					return new Response(shareLink, {
						status: 200,
						headers: {
							'Content-Type': 'text/plain;charset=utf-8',
						},
					});
				}

				case `/${userId}/cl`: {
					const clashConfig = generateClashConfig(
						config.allNodes,
						config.userId,
						request.headers.get('Host') || ''
					);
					return new Response(clashConfig, {
						status: 200,
						headers: {
							'Content-Type': 'text/plain;charset=utf-8',
						},
					});
				}

				case `/${userId}/sb`: {
					const singBoxConfig = generateSingBoxConfig(
						config.allNodes,
						config.userId,
						request.headers.get('Host') || ''
					);
					return new Response(singBoxConfig, {
						status: 200,
						headers: {
							'Content-Type': 'application/json;charset=utf-8',
						},
					});
				}

				case `/${userId}/pty`: {
					const shareLink = generateShareLink(
						config.tlsOnlyNodes,
						config.userId,
						request.headers.get('Host') || ''
					);
					return new Response(shareLink, {
						status: 200,
						headers: {
							'Content-Type': 'text/plain;charset=utf-8',
						},
					});
				}

				case `/${userId}/pcl`: {
					const clashConfig = generateClashConfig(
						config.tlsOnlyNodes,
						config.userId,
						request.headers.get('Host') || ''
					);
					return new Response(clashConfig, {
						status: 200,
						headers: {
							'Content-Type': 'text/plain;charset=utf-8',
						},
					});
				}

				case `/${userId}/psb`: {
					const singBoxConfig = generateSingBoxConfig(
						config.tlsOnlyNodes,
						config.userId,
						request.headers.get('Host') || ''
					);
					return new Response(singBoxConfig, {
						status: 200,
						headers: {
							'Content-Type': 'application/json;charset=utf-8',
						},
					});
				}

				default: {
					// Return CF info for debugging
					return new Response(JSON.stringify(request.cf, null, 4), {
						status: 200,
						headers: {
							'Content-Type': 'application/json;charset=utf-8',
						},
					});
				}
			}
		} catch (err) {
			return new Response((err as Error).toString());
		}
	},
} satisfies ExportedHandler<Env>;
