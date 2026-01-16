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

// ==================== 主入口 ====================

/**
 * Cloudflare Workers 入口函数
 * 处理所有 HTTP/WebSocket 请求
 */
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			// 初始化配置
			const config = createConfig(env);
			const upgradeHeader = request.headers.get('Upgrade');
			const url = new URL(request.url);

			// WebSocket 升级请求 - 处理 VLESS 代理连接
			if (upgradeHeader === 'websocket') {
				return await handleVlessWebSocket(request, config.userId);
			}

			// HTTP 请求 - 处理配置页面和订阅
			const pathname = url.pathname;
			const userId = config.userId;

			// 路由分发
			switch (pathname) {
				case `/${userId}`: {
					// 首页 - 返回 HTML 配置页面
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
					// 通用订阅 - Base64 编码的所有节点
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
					// Clash Meta 订阅 - 所有节点
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
					// Sing-Box 订阅 - 所有节点
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
					// 通用订阅 - 仅 TLS 节点
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
					// Clash Meta 订阅 - 仅 TLS 节点
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
					// Sing-Box 订阅 - 仅 TLS 节点
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
					// 默认返回 Cloudflare 连接信息（用于调试）
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
