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
| `horizontalSelectors` | `boolean` | `false` |
| `showScaleBar` | `boolean` | `true` |
| `lockDrag` | `boolean` | `false` |
| `lockZoom` | `boolean` | `false` |
| `theme` | `'light' | 'dark'` | `'light'` |
| `className` | `string` | 無 |
| `signal` | `AbortSignal` | 無 |
| `onReady` | `(widget: OEMWidget) => void` | 無 |
| `onStateChange` | `(state: OEMWidgetState) => void` | 無 |
| `onError` | `(error: Error) => void` | 無 |

互動鎖定只影響使用者輸入，程式化更新仍然可用。`theme`、`lockDrag`、`lockZoom` 亦支援執行期間更新；控件顯示與佈局仍為建立參數。

## Widget 實例

```ts
interface OEMWidget {
  readonly map: OEMMapAPI;
  readonly destroyed: boolean;
  getState(): OEMWidgetState;
  setOptions(options: OEMWidgetConfig): Promise<void>;
  setCustomPoints(points: readonly OEMCustomPoint[]): Promise<void>;
  loadCustomPoints(url: string): Promise<void>;
  clearCustomPoints(): Promise<void>;
  getPoint(pointId: string): OEMPoint | undefined;
  loadPoint(pointId: string): Promise<OEMPoint | undefined>;
  resize(): void;
  destroy(): void;
}
```


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

## 載入狀態與失敗恢復

顯示選項表示請求的配置。`widget.getResourceState()`（底層實例亦提供）傳回 `points`、`labels`、`boundaries` 的實際狀態，各項包含 `requested`、`status`（`idle`、`loading`、`ready`、`error`）及可選的 `error`。

```ts
const unsubscribe = widget.on('resourcechange', ({ feature, state }) => {
  console.log(feature, state.status);
});
await widget.retry('labels'); // 只重試仍請求開啟、且上次失敗的圖層
await widget.retry();         // 重試所有符合條件的圖層
console.log(widget.getResourceState());
unsubscribe();
```

可選圖層失敗會通知 `onError`，但會保留底圖，也不會拒絕整個配置更新。再次明確開啟同一失敗圖層亦會重試。`retry()` 完成表示本輪請求已結束，是否成功須讀取資源狀態。建立期間的事件不會重播，建立後亦應讀取狀態。

無效配置或必要自訂點資料載入失敗會拒絕更新，不提交該次配置。Widget 更新與地圖寫入共用順序佇列，應使用 `await`；點位寫入不再隱式取消先前請求，可用 `map.loadCustomPoints(url, { signal })` 明確取消。銷毀或取消建立會停止 SDK 等待的請求，遲到回應不會更新實例。取消使用 `AbortError`，呼叫方明確提供的取消原因則予以保留。

靜態資源按可信的匯出資料讀取，初始化只做常數時間的 schema 版本檢查，不掃描 Manifest 內容或逐筆校驗點位、標籤、字典和邊界。完整資料格式、雜湊、位元組數及瓦片索引一致性由匯出校驗負責；排查外部 Manifest 時可主動呼叫 core 套件的 `validateOEMManifest()`。宿主配置與自訂點仍進行必要的輸入檢查。子地區邊界在背景預載，不阻塞建立；完成前點擊採用既有的包圍盒回退。`OEMError` 可從 SDK、map 或 core 匯入，包含 `code`、`operation` 及可用時的欄位 `path`。

## 共用行為 API（第二批）

`createOEM()` 傳回 `OEMMapAPI`，Widget 透過 `widget.map` 提供相同介面，不暴露 Leaflet 或 DOM。地圖寫入與 Widget 更新共用順序佇列，直接操作地圖亦會同步官方控件及 Widget 狀態。讀取、訂閱、`resize()` 和 `destroy()` 為同步操作。

| 能力 | API |
| --- | --- |
| 狀態與視圖 | `getState()`、`getView()`、`update(config)`、`setView(view)`、`setZoom(zoom, options?)`、`fitBounds(pixelBounds)` |
| 地區與內容 | `setRegion(id)`、`setSubregion(id \| null)`、`setFloor(id)`、`setLocale(locale)`、`getLocale()` |
| 圖層與互動 | `setFeatures(features)`、`getResourceState()`、`retry(feature?)`、`getPointFilter()`、`setPointFilter(filter)`、`setMarkerClustering(enabled)`、`setInteractionLocks({ lockDrag?, lockZoom? })` |
| 官方主題 | `setTheme('light' \| 'dark')` |
| 自訂點 | `getCustomPoints()`、`getCustomPoint(id)`、`setCustomPoints(points)`、`upsertCustomPoints(points, options?)`、`removeCustomPoints(ids, options?)`、`clearCustomPoints()`、`loadCustomPoints(url, options?)` |
| 發布點位 | `getPoint(id)`、`loadPoint(id)` |
| 容器座標 | `project(mapPosition)`、`unproject({ x, y })` |

寫入 Promise 完成表示命令已套用及本輪資源請求已結束，不代表動畫或全部瓦片繪製完成；可選圖層須讀取資源狀態。點位命令的 `options.signal` 可取消等待或尚未提交的操作，銷毀則立即取消整個實例。開啟點位圖層會保留篩選，顯示全部類型可用 `update({ markerTypes: '*' })`。

自訂點讀取傳回副本；upsert 按 ID 新增或更新並保留未修改的 Marker；刪除不存在 ID 為無操作。整批更新先檢查再套用。`getPoint()` 讀取目前地區已載入資料，不受顯示篩選影響；`loadPoint()` 可查詢其他地區並快取索引／分片，不改變視圖或顯示集合。

## 事件與可保存的座標

`on()` 傳回取消訂閱函數，事件包括 `click`、`pointclick`、`pointenter`、`pointleave`、`statechange`、`viewchange`、`regionchange`、`floorchange`、`custompointschange`、`resourcechange`、`loading`、`load`、`error`、`destroy`。

地圖點擊不會自動加點。點擊包含唯讀的 `mapPosition`（`space: 'map'`）、`pixelPosition`（`space: 'pixel'`）、`gamePosition`（`space: 'game'` 或 `null`），以及 `context: { schemaVersion, releaseId, gameVersion }`。快照可序列化為 JSON，銷毀地圖後仍可保存及計算。相容欄位 `position`／`game` 分別指向地圖／遊戲座標。

`subregionResolution` 為 `provided`、`geometry`、`bounds` 或 `unresolved`。若需要子地區轉換但僅能靠包圍盒推測，或缺少轉換參數，遊戲座標為 `null`，由 `gameResolution` 說明原因。二維點擊不推斷遊戲高度。

```ts
widget.on('click', snapshot => {
  localStorage.setItem('picked-location', JSON.stringify(snapshot));
});
widget.on('pointclick', event => {
  event.preventDefault(); // 省略即保留發布點位的預設連結
  openDetails(event.source, event.point, event.coordinates);
});
```

點位事件提供 `source: 'published' | 'custom'`、點位副本、座標快照及 `trigger: 'pointer' | 'keyboard'`。點位啟用不會同時觸發地圖空白點擊；自訂點支援 Enter 與空格。集合事件傳回 `{ added, updated, removed }` ID 陣列。

`project()` 將歸一化地圖位置轉為容器內 CSS 像素 `{ x, y }`；`unproject()` 傳回點擊格式的快照。core 提供純函數 `pixelToMapPosition()`、`mapToPixelPosition()`、`gameXZToMapPosition()`、`mapToGameXZPosition()`、`pixelToGameXZPosition()`。計算須使用對應版本的 Manifest 和相同座標空間；未經標定的距離不能直接稱為米。既有輸入可省略 `space`，新事件快照總會標明單位。

## 可選點擊加點工具與遷移

```ts
import { createClickPointTool } from '@opendfieldmap/sdk';
const tool = createClickPointTool(widget.map, {
  mode: 'multiple', style: 'framed', icon: '/pin.webp',
});
await tool.setMode('single');
const ownedPoints = tool.getPoints();
await tool.clear(); // 只刪除本工具的點
tool.destroy();    // 停止訂閱和待處理的加點，保留已有點
```

工具只使用公開事件與集合命令，管理獨立 ID，不刪除宿主點；地圖銷毀時自動停用。停用後仍可明確呼叫 `clear()`。

| 舊呼叫 | 新呼叫 |
| --- | --- |
| `setClickPointMode(options)` | `createClickPointTool(widget.map, options)` |
| `setClickPointMode(null)` | `tool.destroy()` |
| `clearClickPoints()` | `await tool.clear()` |
| 同步修改點位／視圖／圖層 | `await` 對應命令 |
| 直接讀取 `click.game.x` | 先檢查 `gamePosition !== null` 或 `gameResolution` |

顏色、字體、圖示尺寸與錨點維持官方規格，不提供主題變數、字體替換、樣式插槽或任意渲染器入口。
