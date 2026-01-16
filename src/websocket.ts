import { connect } from 'cloudflare:sockets';
import type { VlessHeader } from './types';
import { parseVlessHeader, createVlessResponseHeader } from './vless';

const WS_READY_STATE_OPEN = 1; // WebSocket 已连接状态

// ==================== NAT64 转换函数 ====================

/**
 * 将 IPv4 地址转换为 NAT64 IPv6 地址
 * Cloudflare Workers 使用 NAT64/DNS64 访问 IPv4 服务
 * @param ipv4Address - IPv4 地址字符串
 * @returns NAT64 IPv6 地址
 */
function convertToNAT64IPv6(ipv4Address: string): string {
	const parts = ipv4Address.split('.');
	if (parts.length !== 4) {
		throw new Error('Invalid IPv4 address');
	}

	// 将每个字节转换为十六进制
	const hex = parts.map((part) => {
		const num = parseInt(part, 10);
		if (num < 0 || num > 255) {
			throw new Error('Invalid IPv4 address segment');
		}
		return num.toString(16).padStart(2, '0');
	});

	// 使用固定的 NAT64 前缀
	const prefixes = ['2602:fc59:b0:64::'];
	const chosenPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
	return `[${chosenPrefix}${hex[0]}${hex[1]}:${hex[2]}${hex[3]}]`;
}

/**
 * 通过 DNS 查询获取域名的 IPv6 NAT64 地址
 * @param domain - 要查询的域名
 * @returns NAT64 IPv6 地址
 */
async function getIPv6ProxyAddress(domain: string): Promise<string> {
	try {
		// 使用 Cloudflare DNS 查询 A 记录
		const dnsQuery = await fetch(`https://1.1.1.1/dns-query?name=${domain}&type=A`, {
			headers: {
				Accept: 'application/dns-json',
			},
		});

		const dnsResult = (await dnsQuery.json()) as { Answer?: Array<{ type: number; data: string }> };
		if (dnsResult.Answer && dnsResult.Answer.length > 0) {
			const aRecord = dnsResult.Answer.find((record) => record.type === 1);
			if (aRecord) {
				const ipv4Address = aRecord.data;
				return convertToNAT64IPv6(ipv4Address);
			}
		}
		throw new Error('Failed to resolve IPv4 address for domain');
	} catch (err) {
		throw new Error(`DNS resolution failed: ${(err as Error).message}`);
	}
}

// ==================== WebSocket 流处理 ====================

/**
 * 创建 WebSocket 可读流
 * 将 WebSocket 消息转换为 ReadableStream
 */
function createWebSocketReadableStream(
	ws: WebSocket,
	earlyDataHeader: string
): ReadableStream {
	return new ReadableStream({
		start(controller) {
			// 监听 WebSocket 消息事件
			ws.addEventListener('message', (event) => {
				controller.enqueue(event.data);
			});

			// 监听关闭事件
			ws.addEventListener('close', () => {
				controller.close();
			});

			// 监听错误事件
			ws.addEventListener('error', (err) => {
				controller.error(err);
			});

			// 处理 early data（0-RTT 恢复）
			if (earlyDataHeader) {
				try {
					const decoded = atob(earlyDataHeader.replace(/-/g, '+').replace(/_/g, '/'));
					const data = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
					controller.enqueue(data.buffer);
				} catch (e) {
					// 忽略 early data 解码错误
				}
			}
		},
	});
}

/**
 * 安全关闭 Socket
 */
function closeSocket(socket: any): void {
	if (socket) {
		try {
			socket.close();
		} catch (e) {
			// 忽略关闭错误
		}
	}
}

// ==================== 数据转发 ====================

/**
 * 将远程服务器数据转发到 WebSocket 客户端
 * 首次发送时附带 VLESS 响应头
 */
function pipeRemoteToWebSocket(
	remoteSocket: any,
	ws: WebSocket,
	vlessHeader: Uint8Array,
	retry: (() => void) | null
): void {
	let headerSent = false;
	let hasIncomingData = false;

	remoteSocket.readable
		.pipeTo(
			new WritableStream({
				write(chunk) {
					hasIncomingData = true;
					if (ws.readyState === WS_READY_STATE_OPEN) {
						// 首次数据发送 VLESS 头
						if (!headerSent) {
							const combined = new Uint8Array(vlessHeader.byteLength + chunk.byteLength);
							combined.set(new Uint8Array(vlessHeader), 0);
							combined.set(new Uint8Array(chunk), vlessHeader.byteLength);
							ws.send(combined.buffer);
							headerSent = true;
						} else {
							ws.send(chunk);
						}
					}
				},
				close() {
					// 如果没有收到数据且有重试函数，则重试
					if (!hasIncomingData && retry) {
						retry();
						return;
					}
					if (ws.readyState === WS_READY_STATE_OPEN) {
						ws.close(1000, 'Normal close');
					}
				},
				abort() {
					closeSocket(remoteSocket);
				},
			})
		)
		.catch((err: Error) => {
			console.error('Data transfer error:', err);
			closeSocket(remoteSocket);
			if (ws.readyState === WS_READY_STATE_OPEN) {
				ws.close(1011, 'Data transfer error');
			}
		});
}

// ==================== UDP 处理 ====================

/**
 * 处理 UDP 出站流量（主要用于 DNS 查询）
 * 将 UDP 包转发到 1.1.1.1 DNS 服务器
 */
async function handleUDPOutbound(
	webSocket: WebSocket,
	vlessResponseHeader: Uint8Array
): Promise<{ write: (chunk: Uint8Array) => void }> {
	let isVlessHeaderSent = false;

	// 转换流：解析 UDP 包长度并提取数据
	const transformStream = new TransformStream({
		start() {},
		transform(chunk, controller) {
			for (let index = 0; index < chunk.byteLength; ) {
				const lengthBuffer = chunk.slice(index, index + 2);
				const udpPacketLength = new DataView(lengthBuffer).getUint16(0);
				const udpData = new Uint8Array(chunk.slice(index + 2, index + 2 + udpPacketLength));
				index = index + 2 + udpPacketLength;
				controller.enqueue(udpData);
			}
		},
		flush() {},
	});

	// 将 DNS 查询结果发送回客户端
	transformStream.readable
		.pipeTo(
			new WritableStream({
				async write(chunk) {
					const resp = await fetch('https://1.1.1.1/dns-query', {
						method: 'POST',
						headers: {
							'content-type': 'application/dns-message',
						},
						body: chunk,
					});
					const dnsQueryResult = await resp.arrayBuffer();
					const udpSize = dnsQueryResult.byteLength;
					const udpSizeBuffer = new Uint8Array([(udpSize >> 8) & 0xff, udpSize & 0xff]);

					if (webSocket.readyState === WS_READY_STATE_OPEN) {
						console.log(`DNS query successful, DNS message length: ${udpSize}`);
						if (isVlessHeaderSent) {
							webSocket.send(await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer());
						} else {
							webSocket.send(
								await new Blob([vlessResponseHeader, udpSizeBuffer, dnsQueryResult]).arrayBuffer()
							);
							isVlessHeaderSent = true;
						}
					}
				},
			})
		)
		.catch((error) => {
			console.error('DNS UDP handling error:', error);
		});

	const writer = transformStream.writable.getWriter();

	return {
		write(chunk: Uint8Array) {
			writer.write(chunk);
		},
	};
}

// ==================== 主入口函数 ====================

/**
 * 处理 VLESS WebSocket 连接
 * 这是代理的核心函数，处理客户端连接并转发流量
 */
export async function handleVlessWebSocket(
	request: Request,
	userId: string
): Promise<Response> {
	// 创建 WebSocket 对
	const wsPair = new WebSocketPair();
	const [clientWS, serverWS] = Object.values(wsPair);

	// 接受 WebSocket 连接
	serverWS.accept();

	// 获取 early data 头（用于 0-RTT）
	const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';
	const wsReadable = createWebSocketReadableStream(serverWS, earlyDataHeader);

	let remoteSocket: any = null; // 远程服务器连接
	let udpStreamWrite: ((chunk: Uint8Array) => void) | null = null; // UDP 写入流
	let isDns = false; // 是否是 DNS 流量

	// 将 WebSocket 数据管道化处理
	wsReadable
		.pipeTo(
			new WritableStream({
				async write(chunk) {
					// DNS 流量走 UDP 处理
					if (isDns && udpStreamWrite) {
						return udpStreamWrite(chunk);
					}

					// 已建立连接，直接转发数据
					if (remoteSocket) {
						const writer = remoteSocket.writable.getWriter();
						await writer.write(chunk);
						writer.releaseLock();
						return;
					}

					// 解析 VLESS 头部
					const result = parseVlessHeader(chunk, userId);
					if (result.hasError) {
						throw new Error(result.message);
					}

					const vlessRespHeader = createVlessResponseHeader(result.vlessVersion!);
					const rawClientData = chunk.slice(result.rawDataIndex!);

					// UDP 处理（仅支持 DNS）
					if (result.isUDP) {
						if (result.portRemote === 53) {
							isDns = true;
							const { write } = await handleUDPOutbound(serverWS, vlessRespHeader);
							udpStreamWrite = write;
							udpStreamWrite(rawClientData as Uint8Array);
							return;
						} else {
							throw new Error('UDP proxy only supports DNS (port 53)');
						}
					}

					// TCP 连接函数
					async function connectAndWrite(address: string, port: number): Promise<any> {
						const tcpSocket = await connect({
							hostname: address,
							port: port,
						});
						remoteSocket = tcpSocket;
						const writer = tcpSocket.writable.getWriter();
						await writer.write(rawClientData);
						writer.releaseLock();
						return tcpSocket;
					}

					// NAT64 回退重试函数
					async function retry() {
						try {
							// 获取 NAT64 IPv6 地址
							const proxyIP = await getIPv6ProxyAddress(result.addressRemote!);
							console.log(`Attempting connection via NAT64 IPv6 address ${proxyIP}...`);

							const tcpSocket = await connect({
								hostname: proxyIP,
								port: result.portRemote!,
							});
							remoteSocket = tcpSocket;

							const writer = tcpSocket.writable.getWriter();
							await writer.write(rawClientData);
							writer.releaseLock();

							// 监听连接关闭
							tcpSocket.closed
								.catch((error: Error) => {
									console.error('NAT64 IPv6 connection close error:', error);
								})
								.finally(() => {
									if (serverWS.readyState === WS_READY_STATE_OPEN) {
										serverWS.close(1000, 'Connection closed');
									}
								});

							pipeRemoteToWebSocket(tcpSocket, serverWS, vlessRespHeader, null);
						} catch (err) {
							console.error('NAT64 IPv6 connection failed:', err);
							serverWS.close(1011, `NAT64 IPv6 connection failed: ${(err as Error).message}`);
						}
					}

					// 尝试直接连接，失败则回退到 NAT64
					try {
						const tcpSocket = await connectAndWrite(result.addressRemote!, result.portRemote!);
						pipeRemoteToWebSocket(tcpSocket, serverWS, vlessRespHeader, retry);
					} catch (err) {
						console.error('Connection failed:', err);
						serverWS.close(1011, 'Connection failed');
					}
				},
				close() {
					if (remoteSocket) {
						closeSocket(remoteSocket);
					}
				},
			})
		)
		.catch((err) => {
			console.error('WebSocket error:', err);
			closeSocket(remoteSocket);
			serverWS.close(1011, 'Internal error');
		});

	// 返回 WebSocket 响应
	return new Response(null, {
		status: 101,
		webSocket: clientWS,
	});
}
