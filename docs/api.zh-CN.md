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
| `labels` | `boolean` | `true` |
| `boundaries` | `boolean` | `false` |
| `markerClustering` | `boolean` | `true` |
| `zoom` | 地区范围内的有限数字 | 地区或子地区预设 |
| `center` | `{ x: number; y: number }` | 地区或子地区预设 |

`markerTypes: '*'` 会加载所有已发布点位类型。空数组和 `false` 都会关闭点位数据。点位类型键由数据定义，不受 npm 包内固定联合类型限制。

坐标使用当前地区发布的像素坐标系，不是经纬度。

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
  resize(): void;
  destroy(): void;
}
```

- `getState()` 返回解析后状态的防御性副本。
- `setOptions()` 按调用顺序应用部分内容或视图更新。
- `resize()` 在宿主布局变化后刷新地图尺寸。
- `destroy()` 释放 Widget，可安全重复调用。

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

`@opendfieldmap/map` 导出 `createOEM()` 和框架无关的 `OEM` 接口。它提供视图、地区、楼层、语言、功能层、筛选、聚合、尺寸、事件和生命周期方法，但不挂载 Widget 控件。

标准嵌入场景使用 `@opendfieldmap/sdk`；需要自行管理控件层时使用 `@opendfieldmap/map`。
