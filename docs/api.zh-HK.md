# Widget API

語言：[English](api.md) · [简体中文](api.zh-CN.md) · 繁體中文（香港）

## `createOEMWidget`

```ts
createOEMWidget(
  container: string | HTMLElement,
  options?: OEMWidgetOptions,
): Promise<OEMWidget>
```

在元素或 selector 中建立一個 Widget。元素必須已經存在並具有明確高度；同一容器同時只能承載一個 Widget。

```ts
import { createOEMWidget } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';

const widget = await createOEMWidget('#map', {
  region: 'Valley_4',
  locale: 'zh-HK',
  markerTypes: ['crate_i'],
});
```

模組可以安全地在 SSR 環境匯入，但 `createOEMWidget()` 只能在瀏覽器中呼叫。

## 內容和視圖參數

以下參數既可用於建立，也可傳給 `widget.setOptions()`。

| 參數 | 類型 | 預設值 |
| --- | --- | --- |
| `region` | 地區 ID，或 `VL`、`WL`、`DJ`、`ES` | Manifest 預設地區 |
| `subregion` | 已發佈的子地區 ID 或 `null` | `null` |
| `floor` | 已發佈樓層：`M`、`L1`–`L4`、`B1`–`B4` | `M` |
| `locale` | Manifest 中已發佈的語言 | 瀏覽器語言，其次為 manifest fallback |
| `markerTypes` | 類型鍵陣列、`'*'` 或 `false` | `false` |
| `labels` | `boolean` | `true` |
| `boundaries` | `boolean` | `false` |
| `markerClustering` | `boolean` | `true` |
| `zoom` | 地區範圍內的有限數字 | 地區或子地區預設 |
| `center` | `{ x: number; y: number }` | 地區或子地區預設 |

`markerTypes: '*'` 會載入所有已發佈點位類型。空陣列和 `false` 都會關閉點位資料。點位類型鍵由資料定義，不受 npm 套件內固定 union type 限制。

座標使用目前地區發佈的像素座標系統，不是經緯度。

## 建立參數

| 參數 | 類型 | 預設值 |
| --- | --- | --- |
| `resources` | `OEMResources` | Open Endfield Map 靜態資源源 |
| `manifest` | `OEMManifest` | 從 `resources` 載入 |
| `showRegionSelector` | `boolean` | `true` |
| `showFloorSelector` | `boolean` | `true` |
| `showScaleBar` | `boolean` | `true` |
| `lockDrag` | `boolean` | `false` |
| `lockZoom` | `boolean` | `false` |
| `theme` | `'light' | 'dark'` | `'light'` |
| `className` | `string` | 無 |
| `signal` | `AbortSignal` | 無 |
| `onReady` | `(widget: OEMWidget) => void` | 無 |
| `onStateChange` | `(state: OEMWidgetState) => void` | 無 |
| `onError` | `(error: Error) => void` | 無 |

互動鎖定只影響使用者輸入，程式化更新仍然可用。建立參數不能傳給 `setOptions()`。

## Widget 實例

```ts
interface OEMWidget {
  readonly destroyed: boolean;
  getState(): OEMWidgetState;
  setOptions(options: OEMWidgetConfig): Promise<void>;
  resize(): void;
  destroy(): void;
}
```

- `getState()` 傳回解析後狀態的防禦性副本。
- `setOptions()` 按呼叫順序套用部分內容或視圖更新。
- `resize()` 在宿主版面變化後重新整理地圖尺寸。
- `destroy()` 釋放 Widget，可安全重複呼叫。

Widget 銷毀後，除 `destroy()` 外的其他方法都會拋出錯誤。

狀態包括 `regionId`、`subregionId`、`floorId`、`locale`、`markerTypes`、`labels`、`boundaries`、`markerClustering`、`zoom` 和 `center`。

## 資源

```ts
interface OEMResources {
  baseUrl: string;
  manifestPath: string;
}
```

```ts
const widget = await createOEMWidget('#map', {
  resources: {
    baseUrl: 'https://maps.example.com',
    manifestPath: '/channels/stable.json',
  },
});
```

省略 `resources` 時，SDK 會透過 `https://data.opendfieldmap.org/channels/stable.json` 自動載入最新 release。明確設定 `manifestPath` 可以固定至其他相容的 schema v1 manifest。Manifest 中的資產路徑相對 `baseUrl`，瓦片請求會帶單一檔案 `v` 快取鍵，靜態請求不會攜帶憑證。

## URL 轉接器

`parseOEMUrlState()` 適用於已經把地圖狀態保存在 URL 中的整合。新項目應優先使用具名參數。

```ts
import { createOEMWidget, parseOEMUrlState } from '@opendfieldmap/sdk';

const options = parseOEMUrlState('?r=VL&f=crate_i&s=VL_7&layer=M&z=2');
const widget = await createOEMWidget('#map', options);
```

支援的鍵包括 `r`、`s`、`f`、`l`、`layer`、`labels`、`names`、`boundaries`、`boundary`、`cluster`、`z`、`x` 和 `y`。

## 底層渲染器

`@opendfieldmap/map` 匯出 `createOEM()` 和框架無關的 `OEM` 介面。它提供視圖、地區、樓層、語言、功能層、篩選、聚合、尺寸、事件和生命週期方法，但不掛載 Widget 控制項。

標準嵌入場景使用 `@opendfieldmap/sdk`；需要自行管理控制項層時使用 `@opendfieldmap/map`。
