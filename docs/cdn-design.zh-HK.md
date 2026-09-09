# 靜態資源協議

語言：[English](cdn-design.md) · [简体中文](cdn-design.zh-CN.md) · 繁體中文（香港）

SDK 從一個可設定的資源源載入靜態內容。預設位址為 `https://data.opendfieldmap.org`；本倉庫不會修改 DNS、儲存或 Cloudflare 設定。

## 解析模型

```text
/channels/stable.json
  → /releases/{releaseId}/manifest.json
      → 不可變點位和地圖物件
      → 帶單一瓦片快取版本的穩定瓦片物件
```

channel 是可更新的小型指標。schema v1 release manifest 選擇一套完整資源，manifest 內的所有路徑都相對於設定的資源源。

## 公共路徑

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

`gameVersion` 使用路徑安全形式，例如 `1_5_3`。`releaseId` 令 manifest、點位、地名和邊界保持不可變。`type.json` 保留一般點位類型，並將來源資料中的全部 NPC 和檔案條目分別統一為 `npc` 與 `files` 兩種聚合類型。瓦片物件路徑在同一遊戲版本內保持穩定，SDK 為每張瓦片附加由內容產生的短 `v` 值；未變更的瓦片可跨 release 重用 CDN 快取，只有變更的瓦片需要回源。不帶 `v` 時會存取該穩定路徑下的最新物件。主層瓦片檔名不帶樓層後綴，其他樓層使用 `_l1` 這類小寫檔名後綴。

使用方只需設定 `baseUrl` 和 `manifestPath`，不應自行拼接單一內容路徑。

## 託管契約

- channel 檔案使用短期快取並重新驗證。
- release manifest、版本化物件以及帶 `v` 的瓦片作為不可變內容快取。
- 保持發佈時的 `Content-Type` 和物件位元不變。
- 供第三方網站使用時允許跨來源 `GET`、`HEAD` 和 `OPTIONS`。
- 不使用不透明圖片取代缺失瓦片；未覆蓋座標必須保持透明。

已發佈的 release 目錄不可覆蓋。瓦片物件會在 stable channel 切換前原位更新；單一瓦片 `v` 值可避免 CDN 重用過期內容。

## R2 發佈校驗

執行 `pnpm deploy:data -- --confirm-release <releaseId>` 後，發佈腳本會自動執行 `pnpm validate:r2`。該校驗會用大小比較確認本地物件已全部進入 R2，透過設定的 CDN 取得 manifest 宣告的全部資產，驗證內容位元組與 SHA-256，並檢查 `Content-Type`、`Cache-Control` 和代表性瓦片的回應標頭。它不會開啟瀏覽器，也不會執行線上煙測。

R2 憑證可以透過 `OEM_R2_ACCESS_KEY_ID`、`OEM_R2_ACCESS_KEY_SECRET` 和 `OEM_R2_ENDPOINT` 提供；環境變數優先於本地設定。憑證不應提交到倉庫，也不應出現在 CI 日誌中。

## 自訂資源源

自訂資源源必須實作相同的 channel 和 manifest 契約：

```ts
resources: {
  baseUrl: 'https://maps.example.com',
  manifestPath: '/channels/stable.json',
}
```

SDK 會拒絕 manifest 內的絕對路徑、協議相對路徑和父目錄穿越路徑。
