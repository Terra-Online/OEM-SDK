# Open Endfield Map SDK

語言：[English](../README.md) · [简体中文](README.zh-CN.md) · 繁體中文（香港）

Open Endfield Map SDK 為 Wiki、攻略、資料庫及其他 Web 應用程式提供可嵌入的終末地地圖。它可以獨立渲染地圖、點位、地名、邊界和精簡地圖控制項，不要求宿主接入完整的 Open Endfield Map 主站。

## 安裝

```bash
npm install @opendfieldmap/sdk
```

此套件只提供 ESM，並附帶 TypeScript 類型聲明。宿主應用程式只需匯入一次樣式表。

## 快速開始

為宿主元素設定明確高度，然後使用具名參數建立 Widget：

```html
<div id="map" style="height: 480px"></div>
```

```ts
import { createOEMWidget } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';

const widget = await createOEMWidget('#map', {
  region: 'Valley_4',
  floor: 'M',
  locale: 'zh-HK',
  markerTypes: ['crate_i', 'aurylene'],
  labels: true,
  boundaries: false,
  markerClustering: true,
  showRegionSelector: true,
  showFloorSelector: true,
  showScaleBar: true,
});
```

所有參數均可選。地區、樓層和縮放控制項預設顯示；拖曳和縮放預設可用；點位聚合預設開啟；邊界預設關閉；只有傳入 `markerTypes` 後才會載入點位資料。

點擊點位會開啟對應的 `https://oem.re/<token>` 標準頁面。Widget 不包含主站側邊欄或應用程式狀態。

## 執行時更新

內容和視圖參數可直接更新，毋須替換 Widget：

```ts
await widget.setOptions({
  region: 'Wuling',
  subregion: 'WL_1',
  markerTypes: ['gather'],
  boundaries: true,
});

const state = widget.getState();
widget.resize();
widget.destroy();
```

控制項可見性、互動鎖定、資源位址、主題和生命週期 callback 屬於建立參數；如需修改，應重新建立 Widget。

## React

```bash
npm install @opendfieldmap/react
```

```tsx
import { OEMWidget } from '@opendfieldmap/react';
import '@opendfieldmap/sdk/style.css';

export function MapPanel() {
  return (
    <OEMWidget
      options={{ region: 'Valley_4', markerTypes: ['crate_i'] }}
      style={{ height: 480 }}
    />
  );
}
```

## 架構

```text
宿主應用程式
  ├─ @opendfieldmap/sdk      Widget 生命週期與控制項
  │    ├─ @opendfieldmap/map   框架無關的地圖渲染器
  │    └─ @opendfieldmap/core  Manifest、資源和座標協議
  └─ @opendfieldmap/react    可選的 React 生命週期封裝

靜態資源源
  └─ channel → release manifest → 版本化地圖資源
```

- `@opendfieldmap/sdk` 是主要接入套件。
- `@opendfieldmap/map` 提供底層 `OEM` 渲染器，適合自訂整合。
- `@opendfieldmap/core` 提供共用協議類型和資源工具。
- `@opendfieldmap/react` 管理 Widget 的建立、更新和銷毀。

npm 套件只包含程式碼、樣式和控制項資產；瓦片與地圖資料從設定的靜態資源源載入。

## 資源

預設資源源為 `https://data.opendfieldmap.org`，亦可接入完整相容的自託管資源樹：

```ts
const widget = await createOEMWidget('#map', {
  resources: {
    baseUrl: 'https://maps.example.com',
    manifestPath: '/channels/stable.json',
  },
});
```

channel 會選擇 schema v1 release manifest，再由 manifest 解析所有版本化點位、地名、邊界、瓦片和可選字體資源。使用方毋須自行拼接單一資源位址。

## 開發

```bash
pnpm install
pnpm dev
```

實作修改完成後執行完整本機檢查：

```bash
pnpm check
```

產生 npm 候選套件：

```bash
pnpm pack:release
```

倉庫不會自動發佈 npm 套件，也不會自動修改外部基礎設施。

## 文件

- [Widget API](api.zh-HK.md)
- [靜態資源協議](cdn-design.zh-HK.md)
- [套件與發佈結構](npm-release.zh-HK.md)

SDK 原始碼採用 AGPL-3.0-only 授權條款。靜態遊戲資源和第三方資產可能適用其他條款。
