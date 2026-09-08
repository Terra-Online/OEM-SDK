# 静态资源协议

语言：[English](cdn-design.md) · 简体中文 · [繁體中文（香港）](cdn-design.zh-HK.md)

SDK 从一个可配置的资源源加载静态内容。默认地址为 `https://data.opendfieldmap.org`；本仓库不会修改 DNS、存储或 Cloudflare 配置。

## 解析模型

```text
/channels/stable.json
  → /releases/{releaseId}/manifest.json
      → 不可变点位和地图对象
      → 带单瓦片缓存版本的稳定瓦片对象
```

channel 是可更新的小型指针。schema v1 release manifest 选择一套完整资源，manifest 内的所有路径都相对于配置的资源源。

## 公共路径

```text
/channels/stable.json
/releases/{releaseId}/manifest.json
/marker/{gameVersion}/{releaseId}/points/{subregionId}.json
/marker/{gameVersion}/{releaseId}/locales/{locale}/places.json
/marker/{gameVersion}/{releaseId}/type.json
/marker/{gameVersion}/{releaseId}/point-index.json
/marker/{gameVersion}/{releaseId}/assets/{assetPath}.webp
/map/{gameVersion}/{releaseId}/labels/{regionId}.json
/map/{gameVersion}/{releaseId}/boundaries/{regionId}.json
/tiles/{gameVersion}/{regionId}/{z}/{x}/{y}.webp?v={tileHash}
/tiles/{gameVersion}/{regionId}/{z}/{x}/{y}_{floorId}.webp?v={tileHash}
/fonts/harmony/{sha256}/HMSans.woff2
/fonts/novecento/{sha256}/{filename}.woff2
```

`gameVersion` 使用路径安全形式，例如 `1_5_3`。`releaseId` 使 manifest、点位、地名和边界保持不可变。`type.json` 保留常规点位类型，并将源数据中的全部 NPC 和档案条目分别统一为 `npc` 与 `files` 两种聚合类型。瓦片对象路径在同一游戏版本内保持稳定，SDK 为每张瓦片追加由内容生成的短 `v` 值；未变化的瓦片可跨 release 复用 CDN 缓存，只有变化的瓦片需要回源。不带 `v` 时会访问该稳定路径下的最新对象。主层瓦片文件名不带楼层后缀，其他楼层使用 `_l1` 这类小写文件名后缀。

使用方只需配置 `baseUrl` 和 `manifestPath`，不应自行拼接单个内容路径。
manifest 中的 `HMSans_EN` 是默认西文/UI 字体；获得授权时还会附带
Novecento Wide 的基础、俄文和越南语 family 变体。

## 托管契约

- channel 文件使用短时缓存并重新验证。
- release manifest、版本化对象以及带 `v` 的瓦片作为不可变内容缓存。
- 保持发布时的 `Content-Type` 和对象字节不变。
- 供第三方网站使用时允许跨域 `GET`、`HEAD` 和 `OPTIONS`。
- 不使用不透明图片替代缺失瓦片；未覆盖坐标必须保持透明。

已经发布的 release 目录不可覆盖。瓦片对象会在 stable channel 切换前原位更新；单瓦片 `v` 值可避免 CDN 复用过期内容。

## 自定义资源源

自定义资源源必须实现相同的 channel 和 manifest 契约：

```ts
resources: {
  baseUrl: 'https://maps.example.com',
  manifestPath: '/channels/stable.json',
}
```

SDK 会拒绝 manifest 内的绝对路径、协议相对路径和父目录穿越路径。
