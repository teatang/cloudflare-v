import type { ServerNode, EnvConfig } from './types';

// ==================== 默认配置常量 ====================
// 默认用户 UUID，用于 VLESS 协议认证
const DEFAULT_UUID = '86c50e3a-5b87-49dd-bd20-03c7f2735e40';

// CDN IP 地址，用于生成节点配置
const DEFAULT_CDNIP = 'www.visa.com.sg';

// HTTP 节点 IP 列表（不使用 TLS）
const DEFAULT_HTTP_IPS = [
	'www.visa.com',
	'cis.visa.com',
	'africa.visa.com',
	'www.visa.com.sg',
	'www.visaeurope.at',
	'www.visa.com.mt',
	'qa.visamiddeast.com',
];

// HTTPS 节点 IP 列表（使用 TLS）
const DEFAULT_HTTPS_IPS = [
	'usa.visa.com',
	'myanmar.visa.com',
	'www.visa.com.tw',
	'www.visaeurope.ch',
	'www.visa.com.br',
	'www.visasoutheasteurope.com',
];

// HTTP 端口列表（非 TLS）
const DEFAULT_HTTP_PORTS = ['80', '8080', '8880', '2052', '2082', '2086', '2095'];

// HTTPS 端口列表（TLS）
const DEFAULT_HTTPS_PORTS = ['443', '8443', '2053', '2083', '2087', '2096'];

/**
 * 服务器配置类
 * 管理节点信息，支持从环境变量覆盖默认值
 */
export class ServerConfig {
	private _userId: string;
	private _cdnIp: string;
	private _httpNodes: ServerNode[];
	private _httpsNodes: ServerNode[];

	constructor(env: EnvConfig = {}) {
		// 从环境变量读取配置，如果未设置则使用默认值
		this._userId = env.uuid || DEFAULT_UUID;
		this._cdnIp = env.cdnip || DEFAULT_CDNIP;

		// 构建 HTTP 节点（无 TLS 加密）
		this._httpNodes = DEFAULT_HTTP_IPS.slice(0, 7).map((ip, index) => {
			const key = `pt${index + 1}` as keyof EnvConfig;
			return {
				name: `CF_V${index + 1}`,
				ip,
				port: (env[key] as string) || DEFAULT_HTTP_PORTS[index],
				isTls: false,
			};
		});

		// 构建 HTTPS 节点（TLS 加密）
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

	/** 获取用户 UUID */
	get userId(): string {
		return this._userId;
	}

	/** 获取 CDN IP */
	get cdnIp(): string {
		return this._cdnIp;
	}

	/** 获取所有节点（HTTP + HTTPS） */
	get allNodes(): ServerNode[] {
		return [...this._httpNodes, ...this._httpsNodes];
	}

	/** 获取 HTTP 节点列表 */
	get httpNodes(): ServerNode[] {
		return this._httpNodes;
	}

	/** 获取 HTTPS 节点列表 */
	get httpsNodes(): ServerNode[] {
		return this._httpsNodes;
	}

	/** 获取仅 TLS 节点列表 */
	get tlsOnlyNodes(): ServerNode[] {
		return this._httpsNodes;
	}
}

/** 工厂函数：创建配置实例 */
export function createConfig(env: EnvConfig): ServerConfig {
	return new ServerConfig(env);
}

// 导出常量供其他模块使用
export const VERSION = 'V25.5.27'; // 脚本版本号
export const PATH = '/?ed=2560'; // WebSocket 路径
