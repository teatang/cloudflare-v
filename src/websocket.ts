import { connect } from 'cloudflare:sockets';
import type { VlessHeader } from './types';
import { parseVlessHeader, createVlessResponseHeader } from './vless';

const WS_READY_STATE_OPEN = 1;

/**
 * Convert IPv4 to NAT64 IPv6 address
 */
function convertToNAT64IPv6(ipv4Address: string): string {
	const parts = ipv4Address.split('.');
	if (parts.length !== 4) {
		throw new Error('Invalid IPv4 address');
	}

	const hex = parts.map((part) => {
		const num = parseInt(part, 10);
		if (num < 0 || num > 255) {
			throw new Error('Invalid IPv4 address segment');
		}
		return num.toString(16).padStart(2, '0');
	});

	const prefixes = ['2602:fc59:b0:64::'];
	const chosenPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
	return `[${chosenPrefix}${hex[0]}${hex[1]}:${hex[2]}${hex[3]}]`;
}

/**
 * Get IPv6 proxy address via DNS lookup
 */
async function getIPv6ProxyAddress(domain: string): Promise<string> {
	try {
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

/**
 * Create WebSocket readable stream
 */
function createWebSocketReadableStream(
	ws: WebSocket,
	earlyDataHeader: string
): ReadableStream {
	return new ReadableStream({
		start(controller) {
			ws.addEventListener('message', (event) => {
				controller.enqueue(event.data);
			});

			ws.addEventListener('close', () => {
				controller.close();
			});

			ws.addEventListener('error', (err) => {
				controller.error(err);
			});

			if (earlyDataHeader) {
				try {
					const decoded = atob(earlyDataHeader.replace(/-/g, '+').replace(/_/g, '/'));
					const data = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
					controller.enqueue(data.buffer);
				} catch (e) {
					// Ignore early data decode errors
				}
			}
		},
	});
}

/**
 * Close socket safely
 */
function closeSocket(socket: any): void {
	if (socket) {
		try {
			socket.close();
		} catch (e) {
			// Ignore close errors
		}
	}
}

/**
 * Pipe remote socket data to WebSocket
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

/**
 * Handle UDP outbound traffic (DNS)
 */
async function handleUDPOutbound(
	webSocket: WebSocket,
	vlessResponseHeader: Uint8Array
): Promise<{ write: (chunk: Uint8Array) => void }> {
	let isVlessHeaderSent = false;
	const transformStream = new TransformStream({
		start(controller) {},
		transform(chunk, controller) {
			for (let index = 0; index < chunk.byteLength; ) {
				const lengthBuffer = chunk.slice(index, index + 2);
				const udpPacketLength = new DataView(lengthBuffer).getUint16(0);
				const udpData = new Uint8Array(chunk.slice(index + 2, index + 2 + udpPacketLength));
				index = index + 2 + udpPacketLength;
				controller.enqueue(udpData);
			}
		},
		flush(controller) {},
	});

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

/**
 * Handle VLESS WebSocket connection
 */
export async function handleVlessWebSocket(
	request: Request,
	userId: string
): Promise<Response> {
	const wsPair = new WebSocketPair();
	const [clientWS, serverWS] = Object.values(wsPair);

	serverWS.accept();

	const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';
	const wsReadable = createWebSocketReadableStream(serverWS, earlyDataHeader);
	let remoteSocket: any = null;

	let udpStreamWrite: ((chunk: Uint8Array) => void) | null = null;
	let isDns = false;

	wsReadable
		.pipeTo(
			new WritableStream({
				async write(chunk) {
					if (isDns && udpStreamWrite) {
						return udpStreamWrite(chunk);
					}

					if (remoteSocket) {
						const writer = remoteSocket.writable.getWriter();
						await writer.write(chunk);
						writer.releaseLock();
						return;
					}

					const result = parseVlessHeader(chunk, userId);
					if (result.hasError) {
						throw new Error(result.message);
					}

					const vlessRespHeader = createVlessResponseHeader(result.vlessVersion!);
					const rawClientData = chunk.slice(result.rawDataIndex!);

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

					async function connectAndWrite(address: string, port: number) {
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

					async function retry() {
						try {
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

	return new Response(null, {
		status: 101,
		webSocket: clientWS,
	});
}
