import type { VlessHeader } from './types';

/**
 * Parse VLESS protocol header from WebSocket data
 */
export function parseVlessHeader(buffer: ArrayBuffer, userId: string): VlessHeader {
	if (buffer.byteLength < 24) {
		return { hasError: true, message: 'Invalid header length' };
	}

	const view = new DataView(buffer);
	const version = new Uint8Array(buffer.slice(0, 1));

	const uuid = formatUuid(new Uint8Array(buffer.slice(1, 17)));
	if (uuid !== userId) {
		return { hasError: true, message: 'Invalid user' };
	}

	const optionsLength = view.getUint8(17);
	const command = view.getUint8(18 + optionsLength);

	let isUDP = false;
	if (command === 1) {
		// TCP
	} else if (command === 2) {
		isUDP = true;
	} else {
		return { hasError: true, message: 'Unsupported command, only TCP(01) and UDP(02) supported' };
	}

	let offset = 19 + optionsLength;
	const port = view.getUint16(offset);
	offset += 2;

	const addressType = view.getUint8(offset++);
	let address = '';

	switch (addressType) {
		case 1: // IPv4
			address = Array.from(new Uint8Array(buffer.slice(offset, offset + 4))).join('.');
			offset += 4;
			break;

		case 2: // Domain
			const domainLength = view.getUint8(offset++);
			address = new TextDecoder().decode(buffer.slice(offset, offset + domainLength));
			offset += domainLength;
			break;

		case 3: // IPv6
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
 * Format bytes to UUID string
 */
function formatUuid(bytes: Uint8Array): string {
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Create VLESS response header
 */
export function createVlessResponseHeader(vlessVersion: Uint8Array): Uint8Array {
	return new Uint8Array([vlessVersion[0], 0]);
}
