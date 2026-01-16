export interface EnvConfig {
	uuid?: string;
	cdnip?: string;
	ip1?: string;
	ip2?: string;
	ip3?: string;
	ip4?: string;
	ip5?: string;
	ip6?: string;
	ip7?: string;
	ip8?: string;
	ip9?: string;
	ip10?: string;
	ip11?: string;
	ip12?: string;
	ip13?: string;
	pt1?: string;
	pt2?: string;
	pt3?: string;
	pt4?: string;
	pt5?: string;
	pt6?: string;
	pt7?: string;
	pt8?: string;
	pt9?: string;
	pt10?: string;
	pt11?: string;
	pt12?: string;
	pt13?: string;
}

export interface ServerNode {
	name: string;
	ip: string;
	port: string;
	isTls: boolean;
}

export interface VlessHeader {
	hasError: boolean;
	message?: string;
	addressRemote?: string;
	portRemote?: number;
	rawDataIndex?: number;
	vlessVersion?: Uint8Array;
	isUDP?: boolean;
}

export interface VlessConfig {
	userId: string;
	cdnIp: string;
	httpNodes: ServerNode[];
	httpsNodes: ServerNode[];
}
