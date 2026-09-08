# 靜態資源協議

語言：[English](cdn-design.md) · [简体中文](cdn-design.zh-CN.md) · 繁體中文（香港）

SDK 從一個可設定的資源源載入靜態內容。預設位址為 `https://data.opendfieldmap.org`；本倉庫不會修改 DNS、儲存或 Cloudflare 設定。

## 解析模型

```text
/channels/stable.json
  → /releases/{releaseId}/manifest.json
      → 版本化點位、地圖、瓦片和字體物件
```

channel 是可更新的小型指標。schema v1 release manifest 選擇一套完整資源，manifest 內的所有路徑都相對於設定的資源源。

## 公共路徑

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

`gameVersion` 使用路徑安全形式，例如 `1_5_3`。主層瓦片檔名不帶樓層後綴，其他樓層使用 `_l1` 這類小寫檔名後綴。

使用方只需設定 `baseUrl` 和 `manifestPath`，不應自行拼接單一內容路徑。

## 託管契約

- channel 檔案使用短期快取並重新驗證。
- release manifest 和版本化物件作為不可變內容快取。
- 保持發佈時的 `Content-Type` 和物件位元不變。
- 供第三方網站使用時允許跨來源 `GET`、`HEAD` 和 `OPTIONS`。
- 不使用不透明圖片取代缺失瓦片；未覆蓋座標必須保持透明。

已發佈的遊戲版本目錄不可覆蓋。回復版本透過把 channel 指向較早的相容 release 完成。

## 自訂資源源

自訂資源源必須實作相同的 channel 和 manifest 契約：

```ts
resources: {
  baseUrl: 'https://maps.example.com',
  manifestPath: '/channels/stable.json',
}
```

SDK 會拒絕 manifest 內的絕對路徑、協議相對路徑和父目錄穿越路徑。
