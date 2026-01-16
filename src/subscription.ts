import type { ServerNode } from './types';
import { PATH, VERSION } from './config';

// ==================== 基础函数 ====================

/**
 * 生成单个 VLESS URI 链接
 * 格式: vless://uuid@ip:port?params#name
 */
function generateVlessLink(node: ServerNode, userId: string, hostName: string): string {
	const security = node.isTls ? 'tls' : 'none';
	const sni = node.isTls ? `&sni=${hostName}` : '';

	return `vless://${userId}@${node.ip}:${node.port}?encryption=none&security=${security}${sni}&fp=randomized&type=ws&host=${hostName}&path=${encodeURIComponent(PATH)}#${node.name}_${node.ip}_${node.port}`;
}

/**
 * 生成 Base64 编码的分享链接
 * 将多个 VLESS URI 用换行符连接后 Base64 编码
 */
export function generateShareLink(nodes: ServerNode[], userId: string, hostName: string): string {
	const links = nodes.map((node) => generateVlessLink(node, userId, hostName)).join('\n');
	return btoa(links);
}

// ==================== Clash Meta 配置 ====================

/**
 * 生成 Clash Meta 格式的配置文件
 * 包含代理节点、代理组和规则
 */
export function generateClashConfig(
	nodes: ServerNode[],
	userId: string,
	hostName: string
): string {
	const proxyList = nodes
		.map((node) => {
			const serverIp = node.ip.replace(/[\[\]]/g, '');
			const servername = node.isTls ? `\n  servername: ${hostName}` : '';
			return `
- name: ${node.name}_${node.ip}_${node.port}
  type: vless
  server: ${serverIp}
  port: ${node.port}
  uuid: ${userId}
  udp: false
  tls: ${node.isTls}
  network: ws
  ws-opts:
    path: "${PATH}"
    headers:
      Host: ${hostName}${servername}`;
		})
		.join('');

	const proxyNames = nodes.map((node) => `${node.name}_${node.ip}_${node.port}`).join('\n    - ');

	return `port: 7890
allow-lan: true
mode: rule
log-level: info
unified-delay: true
global-client-fingerprint: chrome
dns:
  enable: false
  listen: :53
  ipv6: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  default-nameserver:
    - 223.5.5.5
    - 114.114.114.114
    - 8.8.8.8
  nameserver:
    - https://dns.alidns.com/dns-query
    - https://doh.pub/dns-query
  fallback:
    - https://1.0.0.1/dns-query
    - tls://dns.google
  fallback-filter:
    geoip: true
    geoip-code: CN
    ipcidr:
      - 240.0.0.0/4

proxies:${proxyList}

proxy-groups:
- name: 负载均衡
  type: load-balance
  url: http://www.gstatic.com/generate_204
  interval: 300
  proxies:
    - ${proxyNames}

- name: 自动选择
  type: url-test
  url: http://www.gstatic.com/generate_204
  interval: 300
  tolerance: 50
  proxies:
    - ${proxyNames}

- name: 🌍选择代理
  type: select
  proxies:
    - 负载均衡
    - 自动选择
    - DIRECT
    - ${proxyNames}

rules:
  - GEOIP,LAN,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,🌍选择代理`;
}

// ==================== Sing-Box 配置 ====================

/**
 * 生成 Sing-Box 格式的配置文件
 * 包含出站规则、DNS 配置和路由规则
 */
export function generateSingBoxConfig(
	nodes: ServerNode[],
	userId: string,
	hostName: string
): string {
	const outbounds = nodes
		.map((node) => {
			const tlsConfig = node.isTls
				? `
		  tls: {
			enabled: true,
			server_name: "${hostName}",
			insecure: false,
			utls: {
			  enabled: true,
			  fingerprint: "chrome"
			}
		  }`
				: '';

			return `{
		  server: "${node.ip}",
		  server_port: ${node.port},
		  tag: "${node.name}_${node.ip}_${node.port}",
		  packet_encoding: "packetaddr",
		  transport: {
			headers: {
			  Host: [
				"${hostName}"
			  ]
			},
			"path": "${PATH}",
			"type": "ws"
		  },${tlsConfig}
		  type: "vless",
		  uuid: "${userId}"
		}`;
		})
		.join(',\n');

	const outboundNames = nodes.map((node) => `"${node.name}_${node.ip}_${node.port}"`).join(',\n');

	return `{
	  "log": {
		"disabled": false,
		"level": "info",
		"timestamp": true
	  },
	  "experimental": {
		"clash_api": {
		  "external_controller": "127.0.0.1:9090",
		  "external_ui": "ui",
		  "external_ui_download_url": "",
		  "external_ui_download_detour": "",
		  "secret": "",
		  "default_mode": "Rule"
		},
		"cache_file": {
		  "enabled": true,
		  "path": "cache.db",
		  "store_fakeip": true
		}
	  },
	  "dns": {
		"servers": [
		  {
			"tag": "proxydns",
			"address": "tls://8.8.8.8/dns-query",
			"detour": "select"
		  },
		  {
			"tag": "localdns",
			"address": "h3://223.5.5.5/dns-query",
			"detour": "direct"
		  },
		  {
			"tag": "dns_fakeip",
			"address": "fakeip"
		  }
		],
		"rules": [
		  {
			"outbound": "any",
			"server": "localdns",
			"disable_cache": true
		  },
		  {
			"clash_mode": "Global",
			"server": "proxydns"
		  },
		  {
			"clash_mode": "Direct",
			"server": "localdns"
		  },
		  {
			"rule_set": "geosite-cn",
			"server": "localdns"
		  },
		  {
			"rule_set": "geosite-geolocation-!cn",
			"server": "proxydns"
		  },
		  {
			"rule_set": "geosite-geolocation-!cn",
			"query_type": [
			  "A",
			  "AAAA"
			],
			"server": "dns_fakeip"
		  }
		],
		"fakeip": {
		  "enabled": true,
		  "inet4_range": "198.18.0.0/15",
		  "inet6_range": "fc00::/18"
		},
		"independent_cache": true,
		"final": "proxydns"
	  },
	  "inbounds": [
		{
		  "type": "tun",
          "tag": "tun-in",
		  "address": [
            "172.19.0.1/30",
		    "fd00::1/126"
      ],
		  "auto_route": true,
		  "strict_route": true,
		  "sniff": true,
		  "sniff_override_destination": true,
		  "domain_strategy": "prefer_ipv4"
		}
	  ],
	  "outbounds": [
		{
		  "tag": "select",
		  "type": "selector",
		  "default": "auto",
		  "outbounds": [
			"auto",
			${outboundNames}
		  ]
		},
		${outbounds},
		{
		  "tag": "direct",
		  "type": "direct"
		},
		{
		  "tag": "auto",
		  "type": "urltest",
		  "outbounds": [
			${outboundNames}
		  ],
		  "url": "https://www.gstatic.com/generate_204",
		  "interval": "1m",
		  "tolerance": 50,
		  "interrupt_exist_connections": false
		}
	  ],
	  "route": {
		"rule_set": [
		  {
			"tag": "geosite-geolocation-!cn",
			"type": "remote",
			"format": "binary",
			"url": "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/geolocation-!cn.srs",
			"download_detour": "select",
			"update_interval": "1d"
		  },
		  {
			"tag": "geosite-cn",
			"type": "remote",
			"format": "binary",
			"url": "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/geolocation-cn.srs",
			"download_detour": "select",
			"update_interval": "1d"
		  },
		  {
			"tag": "geoip-cn",
			"type": "remote",
			"format": "binary",
			"url": "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/cn.srs",
			"download_detour": "select",
			"update_interval": "1d"
		  }
		],
		"auto_detect_interface": true,
		"final": "select",
		"rules": [
          {
         "inbound": "tun-in",
          "action": "sniff"
          },
          {
          "protocol": "dns",
          "action": "hijack-dns"
           },
          {
           "port": 443,
          "network": "udp",
          "action": "reject"
          },
		  {
			"clash_mode": "Direct",
			"outbound": "direct"
		  },
		  {
			"clash_mode": "Global",
			"outbound": "select"
		  },
		  {
			"rule_set": "geoip-cn",
			"outbound": "direct"
		  },
		  {
			"rule_set": "geosite-cn",
			"outbound": "direct"
		  },
		  {
			"ip_is_private": true,
			"outbound": "direct"
		  },
		  {
			"rule_set": "geosite-geolocation-!cn",
			"outbound": "select"
		  }
		]
	  },
	  "ntp": {
		"enabled": true,
		"server": "time.apple.com",
		"server_port": 123,
		"interval": "30m",
		"detour": "direct"
	  }
	}`;
}

// ==================== HTML 配置页面 ====================

/**
 * 生成节点配置 HTML 页面
 * 展示节点信息、链接、订阅地址，支持一键复制
 */
export function generateConfigPage(
	userId: string,
	cdnIp: string,
	httpNodes: ServerNode[],
	httpsNodes: ServerNode[],
	hostName: string
): string {
	// 生成单节点链接
	const wsNode = `vless://${userId}@${cdnIp}:8880?encryption=none&security=none&type=ws&host=${hostName}&path=%2F%3Fed%3D2560#${hostName}`;
	const wsTlsNode = `vless://${userId}@${cdnIp}:8443?encryption=none&security=tls&type=ws&host=${hostName}&sni=${hostName}&fp=random&path=%2F%3Fed%3D2560#${hostName}`;

	// 生成分享链接
	const allShareLink = generateShareLink([...httpNodes, ...httpsNodes], userId, hostName);
	const tlsShareLink = generateShareLink(httpsNodes, userId, hostName);

	// 生成订阅 URL
	const tyUrl = `https://${hostName}/${userId}/ty`;
	const clUrl = `https://${hostName}/${userId}/cl`;
	const sbUrl = `https://${hostName}/${userId}/sb`;
	const ptyUrl = `https://${hostName}/${userId}/pty`;
	const pclUrl = `https://${hostName}/${userId}/pcl`;
	const psbUrl = `https://${hostName}/${userId}/psb`;

	// 判断是否为 workers.dev 域名
	const isWorkersDev = hostName.includes('workers.dev');

	// 极客风格 HTML 模板
	const displayHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VLESS Config - ${VERSION}</title>
<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

:root {
    --bg-primary: #0a0a0f;
    --bg-secondary: #12121a;
    --bg-card: #1a1a24;
    --text-primary: #e6e6e6;
    --text-secondary: #8a8a9a;
    --accent-cyan: #00f0ff;
    --accent-green: #00ff88;
    --accent-purple: #bf00ff;
    --accent-orange: #ff9500;
    --border-color: #2a2a3a;
    --glow-cyan: 0 0 10px rgba(0, 240, 255, 0.5);
    --glow-green: 0 0 10px rgba(0, 255, 136, 0.5);
}

body {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', 'Monaco', monospace;
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    line-height: 1.6;
    background-image:
        radial-gradient(ellipse at top, rgba(0, 240, 255, 0.03) 0%, transparent 50%),
        radial-gradient(ellipse at bottom, rgba(191, 0, 255, 0.03) 0%, transparent 50%);
}

.container {
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 20px;
}

/* Header */
.header {
    text-align: center;
    margin-bottom: 40px;
    padding: 30px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    position: relative;
    overflow: hidden;
}

.header::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--accent-cyan), var(--accent-purple), var(--accent-cyan));
}

.title {
    font-size: 1.8em;
    font-weight: bold;
    color: var(--accent-cyan);
    text-shadow: var(--glow-cyan);
    margin-bottom: 10px;
    letter-spacing: 2px;
}

.version {
    color: var(--accent-purple);
    font-size: 0.9em;
}

.uuid-display {
    margin-top: 15px;
    padding: 10px 15px;
    background: var(--bg-card);
    border-radius: 4px;
    font-size: 0.85em;
    color: var(--text-secondary);
}

.uuid-display span {
    color: var(--accent-green);
}

/* Note */
.note {
    background: rgba(0, 255, 136, 0.05);
    border: 1px solid rgba(0, 255, 136, 0.2);
    border-left: 3px solid var(--accent-green);
    padding: 15px 20px;
    margin: 25px 0;
    border-radius: 4px;
    font-size: 0.9em;
    color: var(--accent-green);
}

/* Section */
.section {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    margin: 25px 0;
    overflow: hidden;
}

.section-header {
    background: var(--bg-card);
    padding: 15px 20px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 10px;
}

.section-number {
    color: var(--accent-orange);
    font-weight: bold;
    font-size: 1.1em;
}

.section-title {
    color: var(--text-primary);
    font-size: 1.1em;
    font-weight: 600;
}

.section-content {
    padding: 20px;
}

/* Node Link */
.node-link {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 15px;
    margin: 15px 0;
    transition: all 0.3s ease;
}

.node-link:hover {
    border-color: var(--accent-cyan);
    box-shadow: var(--glow-cyan);
}

.node-label {
    color: var(--accent-cyan);
    font-size: 0.85em;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.node-url {
    font-size: 0.8em;
    word-break: break-all;
    color: var(--text-secondary);
    margin-bottom: 12px;
    padding: 10px;
    background: var(--bg-primary);
    border-radius: 4px;
    font-family: inherit;
}

/* Button */
.btn {
    display: inline-block;
    padding: 10px 20px;
    background: transparent;
    border: 1px solid var(--accent-cyan);
    color: var(--accent-cyan);
    font-family: inherit;
    font-size: 0.85em;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.btn:hover {
    background: var(--accent-cyan);
    color: var(--bg-primary);
    box-shadow: var(--glow-cyan);
}

.btn-copy {
    width: 100%;
    margin-top: 10px;
}

.btn-copy:active {
    transform: scale(0.98);
}

/* Params */
.params {
    margin-top: 15px;
}

.param-item {
    display: flex;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-color);
    font-size: 0.85em;
}

.param-item:last-child {
    border-bottom: none;
}

.param-key {
    color: var(--accent-purple);
    min-width: 140px;
    flex-shrink: 0;
}

.param-value {
    color: var(--text-secondary);
    word-break: break-all;
}

/* Subscription Links */
.sub-section {
    display: grid;
    gap: 12px;
}

.sub-item {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 12px 15px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    transition: all 0.3s ease;
}

.sub-item:hover {
    border-color: var(--accent-purple);
}

.sub-label {
    min-width: 120px;
    color: var(--accent-orange);
    font-size: 0.85em;
}

.sub-url {
    flex: 1;
    font-size: 0.8em;
    color: var(--text-secondary);
    word-break: break-all;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sub-btn {
    flex-shrink: 0;
    padding: 8px 15px;
    font-size: 0.8em;
}

/* TLS Badge */
.tls-badge {
    display: inline-block;
    padding: 2px 8px;
    background: rgba(191, 0, 255, 0.2);
    border: 1px solid var(--accent-purple);
    color: var(--accent-purple);
    font-size: 0.75em;
    border-radius: 3px;
    margin-left: 10px;
}

.tls-badge.off {
    background: rgba(255, 149, 0, 0.2);
    border-color: var(--accent-orange);
    color: var(--accent-orange);
}

/* Footer */
.footer {
    text-align: center;
    margin-top: 40px;
    padding: 20px;
    color: var(--text-secondary);
    font-size: 0.8em;
    border-top: 1px solid var(--border-color);
}

.footer a {
    color: var(--accent-cyan);
    text-decoration: none;
}

.footer a:hover {
    text-decoration: underline;
}

/* Animations */
@keyframes scanline {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
}

.scanline {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent-cyan), transparent);
    animation: scanline 8s linear infinite;
    opacity: 0.3;
    pointer-events: none;
}

/* Responsive */
@media (max-width: 600px) {
    .container {
        padding: 20px 15px;
    }

    .section-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 5px;
    }

    .sub-item {
        flex-direction: column;
        align-items: flex-start;
    }

    .sub-btn {
        width: 100%;
    }

    .param-item {
        flex-direction: column;
        gap: 5px;
    }
}
</style>
</head>
<body>
<div class="scanline"></div>
<div class="container">`;

	if (isWorkersDev) {
		return `${displayHtml}
    <div class="header">
        <div class="title">VLESS</div>
        <div class="version">// 版本 ${VERSION}</div>
        <div class="uuid-display">用户ID: <span>${userId}</span></div>
    </div>

    <div class="note">
        [系统] ProxyIP 使用 NAT64 自动生成，无需手动设置
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-number">#01</span>
            <span class="section-title">WS节点 <span class="tls-badge off">TLS: 关闭</span></span>
        </div>
        <div class="section-content">
            <div class="node-link">
                <div class="node-label">>> 连接字符串</div>
                <div class="node-url">${wsNode}</div>
                <button class="btn btn-copy" onclick="copyToClipboard('${wsNode}')">[ 复制链接 ]</button>
            </div>
            <div class="params">
                <div class="param-item">
                    <span class="param-key">地址:</span>
                    <span class="param-value">自定义域名 / CDN IP / 代理IP</span>
                </div>
                <div class="param-item">
                    <span class="param-key">端口:</span>
                    <span class="param-value">80, 8080, 8880, 2052, 2082, 2086, 2095</span>
                </div>
                <div class="param-item">
                    <span class="param-key">用户ID:</span>
                    <span class="param-value">${userId}</span>
                </div>
                <div class="param-item">
                    <span class="param-key">传输协议:</span>
                    <span class="param-value">ws</span>
                </div>
                <div class="param-item">
                    <span class="param-key">伪装域名:</span>
                    <span class="param-value">${hostName}</span>
                </div>
                <div class="param-item">
                    <span class="param-key">路径:</span>
                    <span class="param-value">${PATH}</span>
                </div>
                <div class="param-item">
                    <span class="param-key">传输安全:</span>
                    <span class="param-value">关闭</span>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-number">#02</span>
            <span class="section-title">WS+TLS节点 <span class="tls-badge">TLS: 开启</span></span>
        </div>
        <div class="section-content">
            <div class="node-link">
                <div class="node-label">>> 连接字符串</div>
                <div class="node-url">${wsTlsNode}</div>
                <button class="btn btn-copy" onclick="copyToClipboard('${wsTlsNode}')">[ 复制链接 ]</button>
            </div>
            <div class="params">
                <div class="param-item">
                    <span class="param-key">地址:</span>
                    <span class="param-value">自定义域名 / CDN IP / 代理IP</span>
                </div>
                <div class="param-item">
                    <span class="param-key">端口:</span>
                    <span class="param-value">443, 8443, 2053, 2083, 2087, 2096</span>
                </div>
                <div class="param-item">
                    <span class="param-key">用户ID:</span>
                    <span class="param-value">${userId}</span>
                </div>
                <div class="param-item">
                    <span class="param-key">传输协议:</span>
                    <span class="param-value">ws</span>
                </div>
                <div class="param-item">
                    <span class="param-key">伪装域名:</span>
                    <span class="param-value">${hostName}</span>
                </div>
                <div class="param-item">
                    <span class="param-key">路径:</span>
                    <span class="param-value">${PATH}</span>
                </div>
                <div class="param-item">
                    <span class="param-key">传输安全:</span>
                    <span class="param-value">开启</span>
                </div>
                <div class="param-item">
                    <span class="param-key">跳过验证:</span>
                    <span class="param-value">关闭</span>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-number">#03</span>
            <span class="section-title">订阅链接 <span style="color: var(--accent-purple); font-size: 0.8em; margin-left: 10px;">// 共13节点</span></span>
        </div>
        <div class="section-content">
            <div class="sub-section">
                <div class="sub-item">
                    <span class="sub-label">分享链接:</span>
                    <span class="sub-url">Base64编码</span>
                    <button class="btn sub-btn" onclick="copyToClipboard('${allShareLink}')">[ 复制 ]</button>
                </div>
                <div class="sub-item">
                    <span class="sub-label">通用订阅:</span>
                    <span class="sub-url">${tyUrl}</span>
                    <button class="btn sub-btn" onclick="copyToClipboard('${tyUrl}')">[ 复制 ]</button>
                </div>
                <div class="sub-item">
                    <span class="sub-label">Clash订阅:</span>
                    <span class="sub-url">${clUrl}</span>
                    <button class="btn sub-btn" onclick="copyToClipboard('${clUrl}')">[ 复制 ]</button>
                </div>
                <div class="sub-item">
                    <span class="sub-label">Sing-Box订阅:</span>
                    <span class="sub-url">${sbUrl}</span>
                    <button class="btn sub-btn" onclick="copyToClipboard('${sbUrl}')">[ 复制 ]</button>
                </div>
            </div>
            <div class="note" style="margin-top: 15px;">
                [警告] 如果客户端不支持分片功能，TLS节点可能无法使用
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Cloudflare Workers</p>
        <p style="margin-top: 10px;">项目地址: https://github.com/teatang/cloudflare-v</p>
    </div>
</div>

<script>
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        showToast('[ 成功 ] 已复制到剪贴板');
    }, function(err) {
        console.error('复制失败: ', err);
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('Copy');
        document.body.removeChild(textarea);
        showToast('[ 成功 ] 已复制到剪贴板');
    });
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: var(--accent-green); color: var(--bg-primary); padding: 12px 25px; border-radius: 4px; font-size: 0.9em; font-weight: bold; z-index: 9999; animation: fadeInOut 2s ease forwards;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}
</script>
</body>
</html>`;
	} else {
		return `${displayHtml}
    <div class="header">
        <div class="title">VLESS</div>
        <div class="version">// 版本 ${VERSION}</div>
        <div class="uuid-display">用户ID: <span>${userId}</span></div>
    </div>

    <div class="note">
        [系统] ProxyIP 使用 NAT64 自动生成，无需手动设置
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-number">#01</span>
            <span class="section-title">WS+TLS节点 <span class="tls-badge">TLS: 开启</span></span>
        </div>
        <div class="section-content">
            <div class="node-link">
                <div class="node-label">>> 连接字符串</div>
                <div class="node-url">${wsTlsNode}</div>
                <button class="btn btn-copy" onclick="copyToClipboard('${wsTlsNode}')">[ 复制链接 ]</button>
            </div>
            <div class="params">
                <div class="param-item">
                    <span class="param-key">地址:</span>
                    <span class="param-value">自定义域名 / CDN IP / 代理IP</span>
                </div>
                <div class="param-item">
                    <span class="param-key">端口:</span>
                    <span class="param-value">443, 8443, 2053, 2083, 2087, 2096</span>
                </div>
                <div class="param-item">
                    <span class="param-key">用户ID:</span>
                    <span class="param-value">${userId}</span>
                </div>
                <div class="param-item">
                    <span class="param-key">传输协议:</span>
                    <span class="param-value">ws</span>
                </div>
                <div class="param-item">
                    <span class="param-key">伪装域名:</span>
                    <span class="param-value">${hostName}</span>
                </div>
                <div class="param-item">
                    <span class="param-key">路径:</span>
                    <span class="param-value">${PATH}</span>
                </div>
                <div class="param-item">
                    <span class="param-key">传输安全:</span>
                    <span class="param-value">开启</span>
                </div>
                <div class="param-item">
                    <span class="param-key">跳过验证:</span>
                    <span class="param-value">关闭</span>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-number">#02</span>
            <span class="section-title">订阅链接 <span style="color: var(--accent-purple); font-size: 0.8em; margin-left: 10px;">// 共6个TLS节点</span></span>
        </div>
        <div class="section-content">
            <div class="sub-section">
                <div class="sub-item">
                    <span class="sub-label">分享链接:</span>
                    <span class="sub-url">Base64编码</span>
                    <button class="btn sub-btn" onclick="copyToClipboard('${tlsShareLink}')">[ 复制 ]</button>
                </div>
                <div class="sub-item">
                    <span class="sub-label">通用订阅:</span>
                    <span class="sub-url">${ptyUrl}</span>
                    <button class="btn sub-btn" onclick="copyToClipboard('${ptyUrl}')">[ 复制 ]</button>
                </div>
                <div class="sub-item">
                    <span class="sub-label">Clash订阅:</span>
                    <span class="sub-url">${pclUrl}</span>
                    <button class="btn sub-btn" onclick="copyToClipboard('${pclUrl}')">[ 复制 ]</button>
                </div>
                <div class="sub-item">
                    <span class="sub-label">Sing-Box订阅:</span>
                    <span class="sub-url">${psbUrl}</span>
                    <button class="btn sub-btn" onclick="copyToClipboard('${psbUrl}')">[ 复制 ]</button>
                </div>
            </div>
        </div>
    </div>

    <div class="footer">
		<p>Cloudflare Workers</p>
        <p style="margin-top: 10px;">项目地址: https://github.com/teatang/cloudflare-v</p>
    </div>
</div>

<script>
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        showToast('[ OK ] COPIED TO CLIPBOARD');
    }, function(err) {
        console.error('Copy failed: ', err);
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('Copy');
        document.body.removeChild(textarea);
        showToast('[ OK ] COPIED TO CLIPBOARD');
    });
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: var(--accent-green); color: var(--bg-primary); padding: 12px 25px; border-radius: 4px; font-size: 0.9em; font-weight: bold; z-index: 9999; animation: fadeInOut 2s ease forwards;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}
</script>
</body>
</html>`;
	}
}
