import type { VlessHeader } from './types';

/**
 * 解析 VLESS 协议头部
 * @param buffer - WebSocket 接收到的二进制数据
 * @param userId - 预期的用户 UUID
 * @returns 解析结果，包含地址、端口等信息
 */
export function parseVlessHeader(buffer: ArrayBuffer, userId: string): VlessHeader {
	// 检查数据长度是否足够（最小头部 24 字节）
	if (buffer.byteLength < 24) {
		return { hasError: true, message: 'Invalid header length' };
	}

	const view = new DataView(buffer);
	const version = new Uint8Array(buffer.slice(0, 1));

	// 提取并验证 UUID
	const uuid = formatUuid(new Uint8Array(buffer.slice(1, 17)));
	if (uuid !== userId) {
		return { hasError: true, message: 'Invalid user' };
	}

	const optionsLength = view.getUint8(17);
	const command = view.getUint8(18 + optionsLength);

	// 判断是 TCP 还是 UDP
	let isUDP = false;
	if (command === 1) {
		// TCP 连接
	} else if (command === 2) {
		// UDP 转发
		isUDP = true;
	} else {
		return { hasError: true, message: 'Unsupported command, only TCP(01) and UDP(02) supported' };
	}

	// 解析端口号
	let offset = 19 + optionsLength;
	const port = view.getUint16(offset);
	offset += 2;

	// 解析地址类型和地址
	const addressType = view.getUint8(offset++);
	let address = '';

	switch (addressType) {
		case 1: // IPv4 地址
			address = Array.from(new Uint8Array(buffer.slice(offset, offset + 4))).join('.');
			offset += 4;
			break;

		case 2: // 域名
			const domainLength = view.getUint8(offset++);
			address = new TextDecoder().decode(buffer.slice(offset, offset + domainLength));
			offset += domainLength;
			break;

		case 3: // IPv6 地址
			const ipv6 = [];
			for (let i = 0; i < 8; i++) {
				ipv6.push(view.getUint16(offset).toString(16).padStart(4, '0'));
				offset += 2;
			}
			address = ipv6.join(':').replace(/(^|:)0+(\w)/g, '$1$2');
			break;

		default:
			return { hasError: true, message: 'Unsupported address type' };
	}

	return {
		hasError: false,
		addressRemote: address,
		portRemote: port,
		rawDataIndex: offset,
		vlessVersion: version,
		isUDP,
	};
}

/**
 * 将字节数组格式化为标准 UUID 字符串
 */
function formatUuid(bytes: Uint8Array): string {
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 创建 VLESS 响应头部
 * 响应头部格式: [版本号, 0]
 */
export function createVlessResponseHeader(vlessVersion: Uint8Array): Uint8Array {
	return new Uint8Array([vlessVersion[0], 0]);
}
