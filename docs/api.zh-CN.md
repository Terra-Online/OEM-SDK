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
    position: { regionId: 'Valley_4', x: 400, y: 600, floorId: 'M' },
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
| `markerClustering` | `boolean` | `true` |
| `zoom` | 地区范围内的有限数字 | 地区或子地区预设 |
| `center` | `{ x: number; y: number }` | 地区或子地区预设 |

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

`OEMMapPosition` 与地图方向一致：`x` 向右增加，`y` 向下增加。例如 `Valley_4` 中发布坐标 `{ x: 3200, y: 4800 }` 对应 `{ x: 400, y: 600 }`。

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
| `showScaleBar` | `boolean` | `true` |
| `lockDrag` | `boolean` | `false` |
| `lockZoom` | `boolean` | `false` |
| `theme` | `'light' | 'dark'` | `'light'` |
| `className` | `string` | 无 |
| `signal` | `AbortSignal` | 无 |
| `onReady` | `(widget: OEMWidget) => void` | 无 |
| `onStateChange` | `(state: OEMWidgetState) => void` | 无 |
| `onError` | `(error: Error) => void` | 无 |

交互锁定只影响用户输入，程序化更新仍然可用。创建参数不能传给 `setOptions()`。

## Widget 实例

```ts
interface OEMWidget {
  readonly destroyed: boolean;
  getState(): OEMWidgetState;
  setOptions(options: OEMWidgetConfig): Promise<void>;
  setCustomPoints(points: readonly OEMCustomPoint[]): void;
  loadCustomPoints(url: string): Promise<void>;
  clearCustomPoints(): void;
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

状态包括 `regionId`、`subregionId`、`floorId`、`locale`、`markerTypes`、`labels`、`boundaries`、`markerClustering`、`zoom` 和 `center`。

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

const options = parseOEMUrlState('?r=VL&f=crate_i&s=VL_7&layer=M&z=2');
const widget = await createOEMWidget('#map', options);
```

支持的键包括 `r`、`s`、`f`、`l`、`layer`、`labels`、`names`、`boundaries`、`boundary`、`cluster`、`z`、`x` 和 `y`。

## 底层渲染器

`@opendfieldmap/map` 导出 `createOEM()` 和框架无关的 `OEM` 接口。它提供视图、地区、楼层、语言、功能层、筛选、自定义点、点位读取、聚合、尺寸、事件和生命周期方法，但不挂载 Widget 控件。

## 坐标转换

```ts
import { oemToGamePosition } from '@opendfieldmap/sdk';

const horizontal = oemToGamePosition(
  { regionId: 'Valley_4', x: 3200.0568, y: 4502.6376, floorId: 'M' },
  manifest.regions.find((region) => region.id === 'Valley_4')!,
);
// { x: -255.3423, z: -176.8946 }
```

`gameToOEMPosition()` 和 `oemToGamePosition()` 会先应用当前 Atlos 地区转换参数，再在发布像素和归一化地图坐标之间转换。`gameXZToOEMPosition()` 返回归一化地图坐标，可以直接用于自定义点。`mapToGameXZPosition()` 接受归一化地图坐标。对于 `WL_2` 和 `WL_4`，应传入 `subregionId` 以选择对应的武陵转换参数。二维地图坐标可以恢复游戏 `x/z`，不会臆造游戏高度 `y`。

底层 renderer 的 `click` 事件会同时返回两种坐标：

```ts
map.on('click', ({ position, game }) => {
  console.log(position); // 归一化地图坐标
  console.log(game); // 游戏 { x, z }
});
```

Widget 使用 `widget.on('click', handler)` 监听同一事件。

标准嵌入场景使用 `@opendfieldmap/sdk`；需要自行管理控件层时使用 `@opendfieldmap/map`。
