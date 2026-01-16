import type { ServerNode, EnvConfig } from './types';

// Default user ID
const DEFAULT_UUID = '86c50e3a-5b87-49dd-bd20-03c7f2735e40';

// CDN IP (decoded from unicode)
const DEFAULT_CDNIP = 'www.visa.com.sg';

// HTTP IPs
const DEFAULT_HTTP_IPS = [
	'www.visa.com',
	'cis.visa.com',
	'africa.visa.com',
	'www.visa.com.sg',
	'www.visaeurope.at',
	'www.visa.com.mt',
	'qa.visamiddeast.com',
];

// HTTPS IPs
const DEFAULT_HTTPS_IPS = [
	'usa.visa.com',
	'myanmar.visa.com',
	'www.visa.com.tw',
	'www.visaeurope.ch',
	'www.visa.com.br',
	'www.visasoutheasteurope.com',
];

// HTTP ports
const DEFAULT_HTTP_PORTS = ['80', '8080', '8880', '2052', '2082', '2086', '2095'];

// HTTPS ports
const DEFAULT_HTTPS_PORTS = ['443', '8443', '2053', '2083', '2087', '2096'];

export class ServerConfig {
	private _userId: string;
	private _cdnIp: string;
	private _httpNodes: ServerNode[];
	private _httpsNodes: ServerNode[];

	constructor(env: EnvConfig = {}) {
		this._userId = env.uuid || DEFAULT_UUID;
		this._cdnIp = env.cdnip || DEFAULT_CDNIP;

		// Build HTTP nodes (non-TLS)
		this._httpNodes = DEFAULT_HTTP_IPS.slice(0, 7).map((ip, index) => {
			const key = `pt${index + 1}` as keyof EnvConfig;
			return {
				name: `CF_V${index + 1}`,
				ip,
				port: (env[key] as string) || DEFAULT_HTTP_PORTS[index],
				isTls: false,
			};
		});

		// Build HTTPS nodes (TLS)
		this._httpsNodes = DEFAULT_HTTPS_IPS.map((ip, index) => {
			const key = `pt${index + 8}` as keyof EnvConfig;
			return {
				name: `CF_V${index + 8}`,
				ip,
				port: (env[key] as string) || DEFAULT_HTTPS_PORTS[index],
				isTls: true,
			};
		});
	}

	get userId(): string {
		return this._userId;
	}

	get cdnIp(): string {
		return this._cdnIp;
	}

	get allNodes(): ServerNode[] {
		return [...this._httpNodes, ...this._httpsNodes];
	}

	get httpNodes(): ServerNode[] {
		return this._httpNodes;
	}

	get httpsNodes(): ServerNode[] {
		return this._httpsNodes;
	}

	get tlsOnlyNodes(): ServerNode[] {
		return this._httpsNodes;
	}
}

export function createConfig(env: EnvConfig): ServerConfig {
	return new ServerConfig(env);
}

export const VERSION = 'V25.5.27';
export const PATH = '/?ed=2560';
