import type { ServerNode } from './types';
import { PATH, VERSION } from './config';

/**
 * Generate VLESS URI link
 */
function generateVlessLink(node: ServerNode, userId: string, hostName: string): string {
	const security = node.isTls ? 'tls' : 'none';
	const sni = node.isTls ? `&sni=${hostName}` : '';
	const servername = node.isTls ? `servername: ${hostName}` : '';
	const tls = node.isTls ? `tls: true` : `tls: false`;

	return `vless://${userId}@${node.ip}:${node.port}?encryption=none&security=${security}${sni}&fp=randomized&type=ws&host=${hostName}&path=${encodeURIComponent(PATH)}#${node.name}_${node.ip}_${node.port}`;
}

/**
 * Generate base64 encoded share link
 */
export function generateShareLink(nodes: ServerNode[], userId: string, hostName: string): string {
	const links = nodes.map((node) => generateVlessLink(node, userId, hostName)).join('\n');
	return btoa(links);
}

/**
 * Generate Clash Meta configuration
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

/**
 * Generate Sing-Box configuration
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

/**
 * Generate HTML page for node configuration display
 */
export function generateConfigPage(
	userId: string,
	cdnIp: string,
	httpNodes: ServerNode[],
	httpsNodes: ServerNode[],
	hostName: string
): string {
	// Generate single node links
	const wsNode = `vless://${userId}@${cdnIp}:8880?encryption=none&security=none&type=ws&host=${hostName}&path=%2F%3Fed%3D2560#${hostName}`;
	const wsTlsNode = `vless://${userId}@${cdnIp}:8443?encryption=none&security=tls&type=ws&host=${hostName}&sni=${hostName}&fp=random&path=%2F%3Fed%3D2560#${hostName}`;

	// Generate share links
	const allShareLink = generateShareLink([...httpNodes, ...httpsNodes], userId, hostName);
	const tlsShareLink = generateShareLink(httpsNodes, userId, hostName);

	// Generate subscription URLs
	const tyUrl = `https://${hostName}/${userId}/ty`;
	const clUrl = `https://${hostName}/${userId}/cl`;
	const sbUrl = `https://${hostName}/${userId}/sb`;
	const ptyUrl = `https://${hostName}/${userId}/pty`;
	const pclUrl = `https://${hostName}/${userId}/pcl`;
	const psbUrl = `https://${hostName}/${userId}/psb`;

	const note = `注意：ProxyIP使用nat64自动生成，无需设置`;

	const noteshow = note.replace(/\n/g, '<br>');

	const isWorkersDev = hostName.includes('workers.dev');

	const displayHtml = `
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>
<style>
.limited-width {
    max-width: 200px;
    overflow: auto;
    word-wrap: break-word;
}
</style>
</head>
<script>
function copyToClipboard(text) {
  const input = document.createElement('textarea');
  input.style.position = 'fixed';
  input.style.opacity = 0;
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('Copy');
  document.body.removeChild(input);
  alert('已复制到剪贴板');
}
</script>`;

	if (isWorkersDev) {
		return `${displayHtml}
<body>
<br>
<br>
<div class="container">
    <div class="row">
        <div class="col-md-12">
            <h1>Cloudflare-workers/pages-VLESS代理脚本 ${VERSION}</h1>
	    <hr>
            <p>${noteshow}</p>
            <hr>
	    <hr>
	    <hr>
            <br>
            <br>
            <h3>1：CF-workers-VLESS+ws节点</h3>
			<table class="table">
				<thead>
					<tr>
						<th>节点特色：</th>
						<th>单节点链接如下：</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="limited-width">关闭了TLS加密，无视域名阻断</td>
						<td class="limited-width">${wsNode}</td>
						<td><button class="btn btn-primary" onclick="copyToClipboard('${wsNode}')">点击复制链接</button></td>
					</tr>
				</tbody>
			</table>
            <h5>客户端参数如下：</h5>
            <ul>
                <li>客户端地址(address)：自定义的域名 或者 优选域名 或者 优选IP 或者 反代IP</li>
                <li>端口(port)：7个http端口可任意选择(80、8080、8880、2052、2082、2086、2095)，或反代IP对应端口</li>
                <li>用户ID(uuid)：${userId}</li>
                <li>传输协议(network)：ws 或者 websocket</li>
                <li>伪装域名(host)：${hostName}</li>
                <li>路径(path)：${PATH}</li>
				<li>传输安全(TLS)：关闭</li>
            </ul>
            <hr>
			<hr>
			<hr>
            <br>
            <br>
            <h3>2：CF-workers-VLESS+ws+tls节点</h3>
			<table class="table">
				<thead>
					<tr>
						<th>节点特色：</th>
						<th>单节点链接如下：</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="limited-width">启用了TLS加密，<br>如果客户端支持分片(Fragment)功能，建议开启，防止域名阻断</td>
						<td class="limited-width">${wsTlsNode}</td>
						<td><button class="btn btn-primary" onclick="copyToClipboard('${wsTlsNode}')">点击复制链接</button></td>
					</tr>
				</tbody>
			</table>
            <h5>客户端参数如下：</h5>
            <ul>
                <li>客户端地址(address)：自定义的域名 或者 优选域名 或者 优选IP 或者 反代IP</li>
                <li>端口(port)：6个https端口可任意选择(443、8443、2053、2083、2087、2096)，或反代IP对应端口</li>
                <li>用户ID(uuid)：${userId}</li>
                <li>传输协议(network)：ws 或者 websocket</li>
                <li>伪装域名(host)：${hostName}</li>
                <li>路径(path)：${PATH}</li>
                <li>传输安全(TLS)：开启</li>
                <li>跳过证书验证(allowlnsecure)：false</li>
			</ul>
			<hr>
			<hr>
			<hr>
			<br>
			<br>
			<h3>3：聚合通用、Clash-meta、Sing-box订阅链接如下：</h3>
			<hr>
			<p>注意：<br>1、默认每个订阅链接包含TLS+非TLS共13个端口节点<br>2、当前workers域名作为订阅链接，需通过代理进行订阅更新<br>3、如使用的客户端不支持分片功能，则TLS节点不可用</p>
			<hr>
			<table class="table">
					<thead>
						<tr>
							<th>聚合通用分享链接 (可直接导入客户端)：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${allShareLink}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>
			<table class="table">
					<thead>
						<tr>
							<th>聚合通用订阅链接：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td class="limited-width">${tyUrl}</td>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${tyUrl}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>
				<table class="table">
						<thead>
							<tr>
								<th>Clash-meta订阅链接：</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="limited-width">${clUrl}</td>
								<td><button class="btn btn-primary" onclick="copyToClipboard('${clUrl}')">点击复制链接</button></td>
							</tr>
						</tbody>
					</table>
					<table class="table">
					<thead>
						<tr>
							<th>Sing-box订阅链接：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td class="limited-width">${sbUrl}</td>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${sbUrl}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>
				<br>
				<br>
        </div>
    </div>
</div>
</body>`;
	} else {
		return `${displayHtml}
<body>
<br>
<br>
<div class="container">
    <div class="row">
        <div class="col-md-12">
            <h1>Cloudflare-workers/pages-VLESS代理脚本 ${VERSION}</h1>
			<hr>
            <p>${noteshow}</p>
            <hr>
			<hr>
			<hr>
            <br>
            <br>
            <h3>1：CF-pages/workers/自定义域-VLESS+ws+tls节点</h3>
			<table class="table">
				<thead>
					<tr>
						<th>节点特色：</th>
						<th>单节点链接如下：</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="limited-width">启用了TLS加密，<br>如果客户端支持分片(Fragment)功能，可开启，防止域名阻断</td>
						<td class="limited-width">${wsTlsNode}</td>
						<td><button class="btn btn-primary" onclick="copyToClipboard('${wsTlsNode}')">点击复制链接</button></td>
					</tr>
				</tbody>
			</table>
            <h5>客户端参数如下：</h5>
            <ul>
                <li>客户端地址(address)：自定义的域名 或者 优选域名 或者 优选IP 或者 反代IP</li>
                <li>端口(port)：6个https端口可任意选择(443、8443、2053、2083、2087、2096)，或反代IP对应端口</li>
                <li>用户ID(uuid)：${userId}</li>
                <li>传输协议(network)：ws 或者 websocket</li>
                <li>伪装域名(host)：${hostName}</li>
                <li>路径(path)：${PATH}</li>
                <li>传输安全(TLS)：开启</li>
                <li>跳过证书验证(allowlnsecure)：false</li>
			</ul>
            <hr>
			<hr>
			<hr>
            <br>
            <br>
			<h3>2：聚合通用、Clash-meta、Sing-box订阅链接如下：</h3>
			<hr>
			<p>注意：以下订阅链接仅6个TLS端口节点</p>
			<hr>
			<table class="table">
					<thead>
						<tr>
							<th>聚合通用分享链接 (可直接导入客户端)：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${tlsShareLink}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>
			<table class="table">
					<thead>
						<tr>
							<th>聚合通用订阅链接：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td class="limited-width">${ptyUrl}</td>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${ptyUrl}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>
				<table class="table">
						<thead>
							<tr>
								<th>Clash-meta订阅链接：</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="limited-width">${pclUrl}</td>
								<td><button class="btn btn-primary" onclick="copyToClipboard('${pclUrl}')">点击复制链接</button></td>
							</tr>
						</tbody>
					</table>
					<table class="table">
					<thead>
						<tr>
							<th>Sing-box订阅链接：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td class="limited-width">${psbUrl}</td>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${psbUrl}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>
				<br>
				<br>
        </div>
    </div>
</div>
</body>`;
	}
}
