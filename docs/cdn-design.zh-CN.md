# 静态资源协议

语言：[English](cdn-design.md) · 简体中文 · [繁體中文（香港）](cdn-design.zh-HK.md)

SDK 从一个可配置的资源源加载静态内容。默认地址为 `https://data.opendfieldmap.org`；本仓库不会修改 DNS、存储或 Cloudflare 配置。

## 解析模型

```text
/channels/stable.json
  → /releases/{releaseId}/manifest.json
      → 版本化点位、地图、瓦片和字体对象
```

channel 是可更新的小型指针。schema v1 release manifest 选择一套完整资源，manifest 内的所有路径都相对于配置的资源源。

## 公共路径

```text
/channels/stable.json
/releases/{releaseId}/manifest.json
/marker/{gameVersion}/points/{subregionId}.json
/marker/{gameVersion}/locales/{locale}/places.json
/marker/{gameVersion}/types.json
/marker/{gameVersion}/point-index.json
/marker/{gameVersion}/assets/{assetPath}.webp
/map/{gameVersion}/labels/{regionId}.json
/map/{gameVersion}/boundaries/{regionId}.json
/tiles/{gameVersion}/{regionId}/{z}/{x}/{y}.webp
/tiles/{gameVersion}/{regionId}/{z}/{x}/{y}_{floorId}.webp
/fonts/novecento/{sha256}/{filename}.woff2
```

`gameVersion` 使用路径安全形式，例如 `1_5_3`。主层瓦片文件名不带楼层后缀，其他楼层使用 `_l1` 这类小写文件名后缀。

使用方只需配置 `baseUrl` 和 `manifestPath`，不应自行拼接单个内容路径。

## 托管契约

- channel 文件使用短时缓存并重新验证。
- release manifest 和版本化对象作为不可变内容缓存。
- 保持发布时的 `Content-Type` 和对象字节不变。
- 供第三方网站使用时允许跨域 `GET`、`HEAD` 和 `OPTIONS`。
- 不使用不透明图片替代缺失瓦片；未覆盖坐标必须保持透明。

已经发布的游戏版本目录不可覆盖。回滚通过把 channel 指向较早的兼容 release 完成。

## 自定义资源源

自定义资源源必须实现相同的 channel 和 manifest 契约：

```ts
resources: {
  baseUrl: 'https://maps.example.com',
  manifestPath: '/channels/stable.json',
}
```

SDK 会拒绝 manifest 内的绝对路径、协议相对路径和父目录穿越路径。
