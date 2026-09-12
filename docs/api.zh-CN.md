# Widget API

语言：[English](api.md) · 简体中文 · [繁體中文（香港）](api.zh-HK.md)

## `createOEMWidget`

```ts
createOEMWidget(
  container: string | HTMLElement,
  options?: OEMWidgetOptions,
): Promise<OEMWidget>
```

在元素或选择器中创建一个 Widget。元素必须已经存在并具有明确高度；同一容器同时只能承载一个 Widget。

```ts
import { createOEMWidget } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';

const widget = await createOEMWidget('#map', {
  region: 'Valley_4',
  locale: 'zh-CN',
  markerTypes: ['crate_i'],
  customPoints: [{
    id: 'route-start',
    position: { regionId: 'Valley_4', x: 400, z: -600, floorId: 'M' },
    style: 'framed',
    icon: '/icons/route-start.webp',
  }],
});
```

模块可以安全地在 SSR 环境导入，但 `createOEMWidget()` 只能在浏览器中调用。

## 内容和视图参数

以下参数既可用于创建，也可传给 `widget.setOptions()`。

| 参数 | 类型 | 默认值 |
| --- | --- | --- |
| `region` | 地区 ID，或 `VL`、`WL`、`DJ`、`ES` | Manifest 默认地区 |
| `subregion` | 已发布的子地区 ID 或 `null` | `null` |
| `floor` | 已发布楼层：`M`、`L1`–`L4`、`B1`–`B4` | `M` |
| `locale` | Manifest 中已发布的语言 | 浏览器语言，其次为 manifest fallback |
| `markerTypes` | 类型键数组、`'*'` 或 `false` | `false` |
| `customPoints` | `OEMCustomPoint[]` | `[]` |
| `customPointsUrl` | 返回 `OEMCustomPoint[]` JSON 的 URL | 无 |
| `labels` | `boolean` | `true` |
| `boundaries` | `boolean` | `false` |
| `boundarySource` | `'oem' | 'game'` | `'oem'` |
| `markerClustering` | `boolean` | `true` |
| `zoom` | 地区范围内的有限数字 | 地区或子地区预设 |
| `center` | `{ x: number; z: number }` | 地区或子地区预设 |

`markerTypes: '*'` 会加载所有已发布点位类型。空数组和 `false` 都会关闭点位数据。点位类型键由数据定义，不受 npm 包内固定联合类型限制。

视图和已发布点位使用当前地区发布的像素坐标系，不是经纬度。Atlos `markTool` 导出的 `pos` 是地图坐标 `[z, x]`；自定义点和地图选点结果使用归一化地图坐标，即发布像素除以 `2 ** maxNativeZoom`。

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

`OEMMapPosition` 使用水平 `{ x, z }` 字段。`x` 向右增加，`z` 是地图的第二个水平轴。例如 `Valley_4` 中发布坐标 `{ x: 3200, z: -4800 }` 对应归一化地图 `{ x: 400, z: -600 }`，展示为 `Map (x 400, z -600)`。游戏坐标的 `y` 是高度，二维地图位置不会推断该值。

`subregionId` 是可选的子区域标识，对应 Atlos `markTool` 导出的 `subregId`（例如 `VL_1`）。转换 markTool 结果时应保留它；它会选择子区域专用的游戏坐标转换参数。省略时会回退到区域级转换参数，这只适用于该区域没有子区域专用参数的情况。地图点击会在可能时根据当前选中的子区域或已发布边界推断 `subregionId`。

`style` 仅限 Atlos 原生的两种点位组合样式。`framed` 使用 `32 × 32` 像素点位，锚点为 `[16, 32]`；`no-frame` 使用 `50 × 50` 像素点位，锚点为 `[25, 25]`。`icon` 是由对应样式渲染的图片 URL。自定义点不支持尺寸、颜色和标签字段。

大量点位不要内嵌在 `createOEMWidget()` 配置中，应使用 `customPointsUrl`。该 URL 必须返回与 `customPoints` 相同的 JSON 数组；相对图标 URL 会以 JSON URL 为基准解析。`customPoints` 和 `customPointsUrl` 不能同时传入。调用 `setCustomPoints()` 或 `loadCustomPoints()` 会替换当前自定义点位集合。

## 创建参数

| 参数 | 类型 | 默认值 |
| --- | --- | --- |
| `resources` | `OEMResources` | Open Endfield Map 静态资源源 |
| `manifest` | `OEMManifest` | 从 `resources` 加载 |
| `showRegionSelector` | `boolean` | `true` |
| `showFloorSelector` | `boolean` | `true` |
| `horizontalSelectors` | `boolean` | `false` |
| `showScaleBar` | `boolean` | `true` |
| `lockDrag` | `boolean` | `false` |
| `lockZoom` | `boolean` | `false` |
| `theme` | `'light' | 'dark'` | `'light'` |
| `className` | `string` | 无 |
| `signal` | `AbortSignal` | 无 |
| `onReady` | `(widget: OEMWidget) => void` | 无 |
| `onStateChange` | `(state: OEMWidgetState) => void` | 无 |
| `onError` | `(error: Error) => void` | 无 |

交互锁定只影响用户输入，程序化更新仍然可用。其中 `theme`、`lockDrag`、`lockZoom` 也支持运行时通过 `setOptions()` 或底层 API 更新；控件布局与显隐仍为创建参数。

## Widget 实例

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


- `getState()` 返回解析后状态的防御性副本。
- `setOptions()` 按调用顺序应用部分内容或视图更新。
- `resize()` 在宿主布局变化后刷新地图尺寸。
- `destroy()` 释放 Widget，可安全重复调用。

`customPoints` 会替换宿主定义的点位集合。每个点使用归一化地图坐标，即发布像素除以 `2 ** maxNativeZoom`。`style` 仅限 Atlos 原生的 `framed` 和 `no-frame` 两种组合样式，`icon` 是对应样式使用的图片 URL。自定义点不会参与聚合，并会在切换地区或楼层时保留。顶层 `labels` 参数只控制地图已有的地点名称图层，不会给自定义点添加标签。点位集合较大时使用 `loadCustomPoints(url)`。

`getPoint()` 只读取当前已经由点位图层加载的发布点位。`loadPoint()` 会优先使用 `point-index.json`，只请求目标点所在的点位分片；找不到点位时返回 `undefined`。两者都返回点位的地图坐标和保留的原始游戏坐标。

Widget 销毁后，除 `destroy()` 外的其他方法都会抛出错误。

状态包括 `regionId`、`subregionId`、`floorId`、`locale`、`markerTypes`、`labels`、`boundaries`、`boundarySource`、`markerClustering`、`zoom` 和 `center`。`center` 使用水平 `{ x, z }` 坐标；Demo 配置清单将这两个轴标为 `X` 和 `Z`。

`boundarySource: 'oem'` 加载 Atlos 绘制的子区域边界；`boundarySource: 'game'` 加载由 `AKEData` 生成的官方游戏区块边界，渲染方式与前者相同。Game 边界数据仅在当前静态 release 提供的区域中可用。

## 资源

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

省略 `resources` 时，SDK 会通过 `https://data.opendfieldmap.org/channels/stable.json` 自动加载最新 release。显式设置 `manifestPath` 可以固定到其他兼容的 schema v1 manifest。Manifest 中的资产路径相对 `baseUrl`，瓦片请求会带单文件 `v` 缓存键，静态请求不会携带凭据。

## URL 适配器

`parseOEMUrlState()` 适用于已经把地图状态保存在 URL 中的集成。新项目应优先使用具名参数。

```ts
import { createOEMWidget, parseOEMUrlState } from '@opendfieldmap/sdk';

const options = parseOEMUrlState('?r=VL&f=crate_i&s=VL_7&layer=M&z=2&cx=400&cz=-600');
const widget = await createOEMWidget('#map', options);
```

支持的键包括 `r`、`s`、`f`、`l`、`layer`、`labels`、`names`、`boundaries`、`boundary`、`boundarySource`、`cluster`、`z`、`cx` 和 `cz`。其中 `z` 是缩放级别，`cx` 和 `cz` 是地图中心的水平坐标。

## 底层渲染器

`@opendfieldmap/map` 导出 `createOEM()` 和框架无关的 `OEM` 接口。它提供视图、地区、楼层、语言、功能层、筛选、自定义点、点位读取、聚合、尺寸、事件和生命周期方法，但不挂载 Widget 控件。

## 坐标转换

```ts
import { oemToGamePosition } from '@opendfieldmap/sdk';

const horizontal = oemToGamePosition(
  { regionId: 'Valley_4', x: 3200.0568, z: -4502.6376, floorId: 'M' },
  manifest.regions.find((region) => region.id === 'Valley_4')!,
);
// { x: -255.3423, z: -176.8946 }
```

`gameToOEMPosition()` 和 `oemToGamePosition()` 会先应用当前 Atlos 地区转换参数，再在发布像素和归一化地图坐标之间转换。`gameXZToOEMPosition()` 返回归一化地图坐标，可以直接用于自定义点。`mapToGameXZPosition()` 接受归一化地图坐标。对于 `WL_2` 和 `WL_4`，应传入 `subregionId` 以选择对应的武陵转换参数。二维地图坐标可以恢复游戏 `x/z`，不会臆造游戏高度 `y`。

底层 renderer 的 `click` 事件会同时返回两种坐标，也提供相同的点击加点方法：

```ts
map.on('click', ({ position, game }) => {
  console.log(position); // 归一化地图坐标
  console.log(game); // 游戏 { x, z }
});
```

Widget 使用 `widget.on('click', handler)` 监听同一事件。

标准嵌入场景使用 `@opendfieldmap/sdk`；需要自行管理控件层时使用 `@opendfieldmap/map`。

## 加载状态与失败恢复

`labels`、`boundaries` 和点位筛选表示请求的显示配置，不代表资源已经加载成功。通过 `widget.getResourceState()`（底层实例也提供此方法）读取三个可选图层的实际状态：

```ts
const { labels } = widget.getResourceState();
// { requested: true, status: 'idle' | 'loading' | 'ready' | 'error', error?: Error }

const unsubscribe = widget.on('resourcechange', ({ feature, state }) => {
  console.log(feature, state.status);
});

await widget.retry('labels'); // 只重试仍被请求开启、且上次失败的标签图层
await widget.retry();         // 重试所有满足上述条件的可选图层
unsubscribe();
```

可选图层加载失败会通知 `onError`，但不会销毁底图或拒绝整个配置更新。再次明确设置同一已失败图层为开启也会重试。`retry()` 完成表示本轮请求已结束；是否成功应读取 `getResourceState()`。首次创建后同样应读取该状态，创建期间的事件不会重放。

非法配置和必需的自定义点数据加载失败会拒绝更新，不提交该次配置。`widget.setOptions()` 与所有地图写入命令共用顺序队列，均应 `await`。自定义点写入不再隐式取消先前请求；可用 `loadCustomPoints(url, { signal })` 明确取消。销毁或取消创建会终止 SDK 等待的请求，迟到响应不会更新实例。正常取消使用 `AbortError`，显式传入的取消原因予以保留。

静态资源按可信的导出数据读取，初始化只做常数时间的 schema 版本检查，不扫描 Manifest 内容或逐条校验点位、标签、字典和边界。完整数据格式、哈希、字节数和瓦片索引的一致性由导出校验负责；排查外部 Manifest 时可主动调用 core 包的 `validateOEMManifest()`。宿主配置和自定义点继续进行必要的输入检查。用于点击子地区推断的边界预加载在后台进行，不阻塞创建；完成前使用现有的包围盒回退。`OEMError` 提供 `code`、`operation` 及可用时的字段 `path`，可从 SDK、map 或 core 包导入。

## 共享行为 API（第二批）

`createOEM()` 返回 `OEMMapAPI`，Widget 通过 `widget.map` 暴露同一接口。该对象不提供 Leaflet 实例、DOM 节点或自定义渲染器。所有写入命令与 `widget.setOptions()` 共用顺序队列；通过 `widget.map` 修改后，Widget 状态与官方控件同步更新。读取、订阅、`resize()`、`destroy()` 为同步操作。

| 能力 | API |
| --- | --- |
| 状态与视图 | `getState()`、`getView()`、`update(config)`、`setView(view)`、`setZoom(zoom, options?)`、`fitBounds(pixelBounds)` |
| 地区与内容 | `setRegion(id)`、`setSubregion(id \| null)`、`setFloor(id)`、`setLocale(locale)`、`getLocale()` |
| 图层与交互 | `setFeatures(features)`、`getResourceState()`、`retry(feature?)`、`getPointFilter()`、`setPointFilter(filter)`、`setMarkerClustering(enabled)`、`setInteractionLocks({ lockDrag?, lockZoom? })` |
| 官方主题 | `setTheme('light' \| 'dark')` |
| 自定义点 | `getCustomPoints()`、`getCustomPoint(id)`、`setCustomPoints(points)`、`upsertCustomPoints(points, options?)`、`removeCustomPoints(ids, options?)`、`clearCustomPoints()`、`loadCustomPoints(url, options?)` |
| 发布点 | `getPoint(id)`、`loadPoint(id)` |
| 容器坐标 | `project(mapPosition)`、`unproject({ x, y })` |

`getPoint()` 查询当前地区已加载的点位数据；筛选不会改变这份数据。`loadPoint()` 可以查询其他地区，并利用索引与分片缓存，但不会改变当前视图或显示集合。`getCustomPoints()`／`getCustomPoint()` 返回副本。`upsertCustomPoints()` 按 ID 新增或更新，未修改的 Marker 保留；删除不存在的 ID 为无操作。整批替换或更新先完成输入检查再应用。

写入命令的 Promise 表示命令已应用、必要数据已加载、可选图层的本轮请求已结束，不表示缩放动画或全部瓦片已绘制完毕。可选图层仍须检查资源状态。点集合命令的 `options.signal` 可取消等待或尚未提交的操作；销毁立即取消整个实例。`setFeatures({ points: true })` 保留现有类型筛选，显示全部类型可使用 `update({ markerTypes: '*' })`。

```ts
await widget.map.setSubregion('VL_1');
await widget.map.upsertCustomPoints([{
  id: 'saved-location',
  position: { space: 'map', regionId: 'Valley_4', x: 400, z: -600 },
  style: 'framed',
  icon: '/pin.webp',
}]);
await widget.map.removeCustomPoints(['saved-location']);
```

## 事件与可保存的坐标

`on()` 返回取消订阅函数。支持 `click`、`pointclick`、`pointenter`、`pointleave`、`statechange`、`regionchange`、`floorchange`、`viewchange`、`custompointschange`、`resourcechange`、`loading`、`load`、`error`、`destroy`。

地图空白点击只提供数据，不自动加点。`click` 包含只读的 `mapPosition`（`space: 'map'`）、`pixelPosition`（`space: 'pixel'`）、`gamePosition`（`space: 'game'` 或 `null`），以及 `context: { schemaVersion, releaseId, gameVersion }`。这些快照不引用地图或 DOM，可在销毁实例后继续序列化、保存和计算。兼容字段 `position`／`game` 分别指向地图／游戏坐标。

`subregionResolution` 为 `provided`、`geometry`、`bounds` 或 `unresolved`。需要子地区转换但只能通过包围盒推测，或没有转换参数时，`gamePosition` 返回 `null`，原因由 `gameResolution` 表达。二维点击不推断游戏高度。

```ts
const stop = widget.on('click', (snapshot) => {
  localStorage.setItem('picked-location', JSON.stringify(snapshot));
});

widget.on('pointclick', (event) => {
  event.preventDefault(); // 接管默认链接；只监听则保留默认链接行为
  openDetails(event.source, event.point, event.coordinates);
});
```

点位事件包含 `source: 'published' | 'custom'`、点位副本、坐标快照及 `trigger: 'pointer' | 'keyboard'`。点位激活不会再产生地图空白点击。鼠标进入／离开通过 `pointenter`／`pointleave` 订阅；自定义点支持 Enter 和空格激活。`custompointschange` 返回 `{ added, updated, removed }` ID 数组，需要数据时读取点集合 API。

`project()` 输入归一化地图位置，输出地图容器内 CSS 像素 `{ x, y }`；`unproject()` 返回与点击相同的坐标快照。`pixelToMapPosition()`、`mapToPixelPosition()`、`gameXZToMapPosition()`、`mapToGameXZPosition()`、`pixelToGameXZPosition()` 是无需地图实例的纯转换函数，可从 core 导入。计算应使用同一坐标空间及对应版本的 Manifest；未经标定的距离不能直接称为米。现有输入可省略 `space` 以兼容历史数据，新事件快照总是携带单位标识。

## 可选的点击加点工具与迁移

```ts
import { createClickPointTool } from '@opendfieldmap/sdk';

const tool = createClickPointTool(widget.map, {
  mode: 'multiple', style: 'framed', icon: '/pin.webp',
});
await tool.setMode('single');
const ownedPoints = tool.getPoints();
await tool.clear(); // 只删除本工具创建的点
tool.destroy();    // 停止订阅与未完成的加点；已有点保留
```

工具仅组合公开的点击、点集合和销毁 API，没有内核专用点击点集合。它使用独立 ID 管理自己创建的点，不删除宿主点；地图销毁时工具自动停用。停止后仍可显式调用 `clear()` 清除它保留的点。

| 旧调用 | 新调用 |
| --- | --- |
| `setClickPointMode(options)` | `createClickPointTool(widget.map, options)` |
| `setClickPointMode(null)` | `tool.destroy()` |
| `clearClickPoints()` | `await tool.clear()` |
| 同步修改点、楼层、视图等 | `await` 对应写入命令 |
| 直接取 `click.game.x` | 先检查 `gamePosition !== null` 或 `gameResolution` |

颜色、字体、图标尺寸／锚点等仍为官方固定样式。没有主题变量、字体替换、样式插槽或任意渲染器入口。
