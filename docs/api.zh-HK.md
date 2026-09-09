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
  customPoints: [{
    id: 'route-start',
    position: { regionId: 'Valley_4', x: 400, z: -600, floorId: 'M' },
    style: 'framed',
    icon: '/icons/route-start.webp',
  }],
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
| `customPoints` | `OEMCustomPoint[]` | `[]` |
| `customPointsUrl` | 返回 `OEMCustomPoint[]` JSON 的 URL | 無 |
| `labels` | `boolean` | `true` |
| `boundaries` | `boolean` | `false` |
| `boundarySource` | `'oem' | 'game'` | `'oem'` |
| `markerClustering` | `boolean` | `true` |
| `zoom` | 地區範圍內的有限數字 | 地區或子地區預設 |
| `center` | `{ x: number; z: number }` | 地區或子地區預設 |

`markerTypes: '*'` 會載入所有已發佈點位類型。空陣列和 `false` 都會關閉點位資料。點位類型鍵由資料定義，不受 npm 套件內固定 union type 限制。

視圖和已發佈點位使用目前地區發佈的像素座標系統，不是經緯度。Atlos `markTool` 匯出的 `pos` 是地圖座標 `[z, x]`；自訂點和地圖選點結果使用標準化地圖座標，即發佈像素除以 `2 ** maxNativeZoom`。

```ts
interface OEMCustomPoint {
  id: string;
  position: OEMMapPosition;
  style: 'framed' | 'no-frame';
  icon: string;
}
```

```ts
interface OEMClickPointOptions {
  mode: 'multiple' | 'single';
  style: 'framed' | 'no-frame';
  icon: string;
}
```

`OEMMapPosition` 使用水平 `{ x, z }` 欄位。`x` 向右增加，`z` 是地圖的第二個水平軸。例如 `Valley_4` 中發佈座標 `{ x: 3200, z: -4800 }` 對應標準化地圖 `{ x: 400, z: -600 }`，展示為 `Map (x 400, z -600)`。遊戲座標的 `y` 是高度，二維地圖位置不會推斷該值。

`subregionId` 是可選的子地區識別，對應 Atlos `markTool` 匯出的 `subregId`（例如 `VL_1`）。轉換 markTool 結果時應保留它；它會選擇子地區專用的遊戲座標轉換參數。省略時會回退至地區級轉換參數，這只適用於該地區沒有子地區專用參數的情況。地圖點擊會在可能時根據目前選取的子地區或已發佈邊界推斷 `subregionId`。

`style` 僅限 Atlos 原生的兩種點位組合樣式。`framed` 使用 `32 × 32` 像素點位，錨點為 `[16, 32]`；`no-frame` 使用 `50 × 50` 像素點位，錨點為 `[25, 25]`。`icon` 是由相應樣式渲染的圖片 URL。自訂點不支援尺寸、顏色和標籤欄位。

大量點位不應內嵌在 `createOEMWidget()` 設定中，應使用 `customPointsUrl`。該 URL 必須返回與 `customPoints` 相同的 JSON 陣列；相對圖示 URL 會以 JSON URL 為基準解析。`customPoints` 和 `customPointsUrl` 不能同時傳入。呼叫 `setCustomPoints()` 或 `loadCustomPoints()` 會取代目前的自訂點位集合。

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
  setCustomPoints(points: readonly OEMCustomPoint[]): void;
  setClickPointMode(options: OEMClickPointOptions | null): void;
  clearClickPoints(): void;
  loadCustomPoints(url: string): Promise<void>;
  clearCustomPoints(): void;
  getPoint(pointId: string): OEMPoint | undefined;
  loadPoint(pointId: string): Promise<OEMPoint | undefined>;
  resize(): void;
  destroy(): void;
}
```

`setClickPointMode()` 會開啟地圖點擊自動加點。`mode: 'multiple'` 會保留每次點擊建立的點，`mode: 'single'` 只保留最後一個點擊點；`style` 和 `icon` 分別指定點的組合樣式及圖示。傳入 `null` 可關閉模式；`clearClickPoints()` 只清除點擊建立的點，不會清除透過 `setCustomPoints()` 寫入的點。

- `getState()` 傳回解析後狀態的防禦性副本。
- `setOptions()` 按呼叫順序套用部分內容或視圖更新。
- `resize()` 在宿主版面變化後重新整理地圖尺寸。
- `destroy()` 釋放 Widget，可安全重複呼叫。

`customPoints` 會取代宿主定義的點位集合。每個點使用標準化地圖座標，即發佈像素除以 `2 ** maxNativeZoom`。`style` 僅限 Atlos 原生的 `framed` 和 `no-frame` 兩種組合樣式，`icon` 是相應樣式使用的圖片 URL。自訂點不會參與聚合，並會在切換地區或樓層時保留。頂層 `labels` 參數只控制地圖已有的地點名稱圖層，不會為自訂點新增標籤。點位集合較大時使用 `loadCustomPoints(url)`。

`getPoint()` 只讀取目前已由點位圖層載入的發佈點位。`loadPoint()` 會優先使用 `point-index.json`，只請求目標點所在的點位分片；找不到點位時返回 `undefined`。兩者都返回點位的地圖座標和保留的原始遊戲座標。

Widget 銷毀後，除 `destroy()` 外的其他方法都會拋出錯誤。

狀態包括 `regionId`、`subregionId`、`floorId`、`locale`、`markerTypes`、`labels`、`boundaries`、`boundarySource`、`markerClustering`、`zoom` 和 `center`。`center` 使用水平 `{ x, z }` 座標；Demo 設定清單將這兩個軸標為 `X` 和 `Z`。

`boundarySource: 'oem'` 載入 Atlos 繪製的子地區邊界；`boundarySource: 'game'` 載入由 `AKEData` 生成的官方遊戲區塊邊界，渲染方式與前者相同。Game 邊界資料只在目前靜態 release 提供的區域中可用。

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

const options = parseOEMUrlState('?r=VL&f=crate_i&s=VL_7&layer=M&z=2&cx=400&cz=-600');
const widget = await createOEMWidget('#map', options);
```

支援的鍵包括 `r`、`s`、`f`、`l`、`layer`、`labels`、`names`、`boundaries`、`boundary`、`boundarySource`、`cluster`、`z`、`cx` 和 `cz`。其中 `z` 是縮放級別，`cx` 和 `cz` 是地圖中心的水平座標。

## 底層渲染器

`@opendfieldmap/map` 匯出 `createOEM()` 和框架無關的 `OEM` 介面。它提供視圖、地區、樓層、語言、功能層、篩選、自訂點、點位讀取、聚合、尺寸、事件和生命週期方法，但不掛載 Widget 控制項。

## 座標轉換

```ts
import { oemToGamePosition } from '@opendfieldmap/sdk';

const horizontal = oemToGamePosition(
  { regionId: 'Valley_4', x: 3200.0568, z: -4502.6376, floorId: 'M' },
  manifest.regions.find((region) => region.id === 'Valley_4')!,
);
// { x: -255.3423, z: -176.8946 }
```

`gameToOEMPosition()` 和 `oemToGamePosition()` 會先應用目前 Atlos 地區轉換參數，再在發佈像素和標準化地圖座標之間轉換。`gameXZToOEMPosition()` 返回標準化地圖座標，可以直接用於自訂點。`mapToGameXZPosition()` 接受標準化地圖座標。對於 `WL_2` 和 `WL_4`，應傳入 `subregionId` 以選擇對應的武陵轉換參數。二維地圖座標可以恢復遊戲 `x/z`，不會臆造遊戲高度 `y`。

底層 renderer 的 `click` 事件會同時返回兩種座標，亦提供相同的點擊加點方法：

```ts
map.on('click', ({ position, game }) => {
  console.log(position); // 標準化地圖座標
  console.log(game); // 遊戲 { x, z }
});
```

Widget 使用 `widget.on('click', handler)` 監聽同一事件。

標準嵌入場景使用 `@opendfieldmap/sdk`；需要自行管理控制項層時使用 `@opendfieldmap/map`。
