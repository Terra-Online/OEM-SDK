# 終末地地圖集（OEM）SDK

[![線上示範](https://img.shields.io/badge/demo-sdk.opendfieldmap.org-111111?style=flat-square)](https://sdk.opendfieldmap.org/demo/)
[![GitHub](https://img.shields.io/badge/source-GitHub-24292f?style=flat-square&logo=github)](https://github.com/Terra-Online/OEM-SDK)
[![授權條款](https://img.shields.io/badge/license-AGPL--3.0--only-fbc825?style=flat-square)](LICENSE)

其他語言版本：[English](../README.md) · [简体中文](README.zh-CN.md) · 繁體中文

Open Endfield Map SDK 系面向《明日方舟：終末地》Wiki、資料庫及其他社群工具項目的、易整合的地圖元件。透過即開即用的整合介面，即可建立功能豐富、可互動的終末地地圖，毋須自行維護底層地圖瓦片和遊戲資料。

依託 [Open Endfield Map](https://github.com/Terra-Online/Atlos)，SDK 可直接使用由我們持續維護的地圖來源和資料集。歷史版本亦會與目前數據一併保留，可用於版本差異比對、內容核驗、考據及研究。

**一次整合，自動更新，地圖維護交給我們。**

## 預覽

互動式示範可於 [sdk.opendfieldmap.org/demo](https://sdk.opendfieldmap.org/demo/) 查看。

![Open Endfield Map SDK 預覽](assets/preview.webp)

## 提供能力

- **互動式地圖渲染**，支援點位、標籤、邊界、區域、樓層、聚合、主題和可設定控制項。
- **與框架無關的整合方式**，並提供一流的 React 支援。
- **帶版本的地圖來源和資料集**，涵蓋目前及歷史遊戲版本。
- **本地化支援**，可使用所支援的語言建立地圖內容。
- **由 OEM 基礎設施託管的資料與資源分發**。您毋須再為地圖瓦片和資料採集、更新或託管操心。
- **自訂疊加層**，支援在執行期間加入自訂點位、點擊自動加點、基於索引的單點查詢，以及遊戲座標與地圖橫向座標之間的轉換。

多數常用設定皆可在 [**SDK Demo**](https://sdk.opendfieldmap.org/demo) 中直接體驗、設定，並會隨著設定調整產生可直接使用的整合程式碼。

至於需要精細控制的應用程式，OEM SDK 亦提供更底層的 API。詳見我們的 [Widget API 文件](api.zh-HK.md)。

## 安裝與設定

主要入口套件為 `@opendfieldmap/sdk`：

```bash
npm install @opendfieldmap/sdk
```

為宿主元素設定明確高度，匯入一次樣式檔案，然後使用具名選項建立 Widget：

```html
<div id="map" style="height: 480px"></div>
```

```ts
import { createOEMWidget } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';

const widget = await createOEMWidget('#map', {
  region: 'WL',
  locale: 'zh-HK',
  markerTypes: '*',
  zoom: 2,
  center: { x: 7425, z: -6257 },
});

// 後續：
await widget.setOptions({ region: 'WL', markerTypes: ['gather'] });
widget.destroy();
```

預設情況下，SDK 會使用由 Open Endfield Map 維護的最新穩定版地圖資料。您亦可以選擇使用帶有本 SDK 可識別之 manifest 的自行託管資源：

```ts
const widget = await createOEMWidget('#map', {
  resources: {
    baseUrl: 'https://maps.example.com',
    manifestPath: '/channels/stable.json',
  },
  region: 'DJ',
  markerTypes: false,
});
```

對於 React 應用程式：

```bash
npm install @opendfieldmap/react
```

```tsx
import { OEMWidget } from '@opendfieldmap/react';
import '@opendfieldmap/sdk/style.css';

export function MapPanel() {
  return <OEMWidget options={{ region: 'ES', markerTypes: ['crate_i'] }} style={{ height: 480 }} />;
}
```

## 套件結構

| 套件 | 用途 |
| --- | --- |
| `@opendfieldmap/sdk` | 主要的嵌入式 Widget 與標準控制項 |
| `@opendfieldmap/map` | 更底層、與框架無關的地圖渲染器 |
| `@opendfieldmap/core` | Manifest schema、資源輔助工具、座標和點位連結 |
| `@opendfieldmap/react` | Widget 的 React 生命週期封裝 |

## 開發

```bash
pnpm install
pnpm dev                 # 本機 HMR 示範：http://127.0.0.1:4173/demo/
pnpm build               # 建置各套件發佈產物
pnpm pack:release        # 將 npm tarball 寫入 artifacts/npm
pnpm build:demo          # 建置 Pages 部署產物
pnpm update:local        # 本地匯出、校驗、建置 demo 並產生確定性 R2 計劃
pnpm update:demo         # 僅更新 demo，不修改 manifest/channel
pnpm update:release      # 使用同一批次發佈資料並部署匹配的 Pages 產物
```

Demo 建置僅包含應用程式本身，不會打包地圖瓦片或資料。

## 連結

- [線上 SDK Demo](https://sdk.opendfieldmap.org/demo/)
- [OEM-SDK 原始碼儲存庫](https://github.com/Terra-Online/OEM-SDK)
- [Widget API](api.zh-HK.md) · [English](api.md) · [简体中文](api.zh-CN.md)
- [靜態資源協定](cdn-design.zh-HK.md) · [English](cdn-design.md) · [简体中文](cdn-design.zh-CN.md)
- [套件與 NPM 發佈結構](npm-release.zh-HK.md) · [English](npm-release.md) · [简体中文](npm-release.zh-CN.md)
- [服務條款](https://blog.opendfieldmap.org/docs/tos#intellectual-property-and-copyright)
