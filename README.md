# Cloudflare Workers VLESS Proxy

基于 Cloudflare Workers 的 VLESS 代理脚本，支持 WebSocket + TLS 传输。

## 功能特性

- **VLESS 协议**：支持标准 VLESS 协议
- **WebSocket 传输**：使用 WebSocket 传输数据
- **TLS 支持**：支持 TLS 加密（可选）
- **多节点**：内置 13 个节点（7 个非 TLS + 6 个 TLS）
- **NAT64 支持**：自动将 IPv4 转换为 NAT64 IPv6
- **订阅支持**：支持通用、Clash Meta、Sing-Box 订阅格式
- **配置页面**：提供友好的配置页面和复制功能

## 节点列表

### HTTP 节点（非 TLS）

| 端口 | 描述 |
|------|------|
| 80 | HTTP |
| 8080 | HTTP 代理 |
| 8880 | HTTP 代理 |
| 2052 | Cloudflare |
| 2082 | cPanel |
| 2086 | GNUX |
| 2095 | cPanel |

### HTTPS 节点（TLS）

| 端口 | 描述 |
|------|------|
| 443 | HTTPS 标准端口 |
| 8443 | HTTPS 替代端口 |
| 2053 | Cloudflare DoH |
| 2083 | cPanel HTTPS |
| 2087 | GNUX HTTPS |
| 2096 | cPanel HTTPS |

## 快速部署

### 1. 安装依赖

```bash
pnpm install
```

### 2. 本地开发

```bash
pnpm dev
```

访问 http://localhost:8787 查看配置页面。

### 3. 部署到 Cloudflare

```bash
pnpm deploy
```

## 配置说明

### 环境变量

在 `wrangler.jsonc` 中配置：

```json
{
  "vars": {
    "uuid": "your-uuid-here",
    "cdnip": "www.visa.com.sg",
    "ip1": "www.visa.com",
    "ip2": "cis.visa.com",
    "...": "..."
  }
}
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `uuid` | VLESS 用户 ID | 自动生成 |
| `cdnip` | CDN IP 地址 | www.visa.com.sg |
| `ip1` - `ip13` | 节点 IP | 见默认值 |
| `pt1` - `pt13` | 节点端口 | 见默认端口 |

### 订阅地址

部署后访问以下地址获取订阅：

- `/{uuid}/ty` - 通用 Base64 订阅
- `/{uuid}/cl` - Clash Meta 订阅
- `/{uuid}/sb` - Sing-Box 订阅
- `/{uuid}/pty` - 仅 TLS 通用订阅
- `/{uuid}/pcl` - 仅 TLS Clash 订阅
- `/{uuid}/psb` - 仅 TLS Sing-Box 订阅

### 客户端配置

#### VLESS URI 示例

```
vless://uuid@ip:port?encryption=none&security=tls&type=ws&host=your-domain&sni=your-domain&path=%2F%3Fed%3D2560#节点名称
```

#### 参数说明

| 参数 | 值 |
|------|-----|
| encryption | none |
| security | none / tls |
| type | ws |
| host | 你的域名 |
| path | /?ed=2560 |
| sni | 你的域名（TLS 时） |

## 项目结构

```
cloudflare-v/
├── src/
│   ├── index.ts          # 主入口
│   ├── types.ts          # 类型定义
│   ├── config.ts         # 配置管理
│   ├── vless.ts          # VLESS 协议解析
│   ├── websocket.ts      # WebSocket 处理
│   └── subscription.ts   # 订阅配置生成
├── test/                 # 测试文件
├── wrangler.jsonc       # Cloudflare 配置
├── vitest.config.mts    # Vitest 配置
└── package.json
```

## 技术栈

- **Cloudflare Workers** - 无服务器运行环境
- **TypeScript** - 类型安全的代码
- **Vitest** - 测试框架
- **VLESS** - 代理协议

## License

MIT

## 参考

- [VLESS 协议](https://github.com/v2fly/v2fly-core/issues/501)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
