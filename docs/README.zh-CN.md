# Open Endfield Map SDK

语言：[English](../README.md) · 简体中文 · [繁體中文（香港）](README.zh-HK.md)

Open Endfield Map SDK (`@opendfieldmap/sdk`) 为 Wiki、攻略、资料库及其他 Web 应用提供可嵌入的终末地地图。它可以独立渲染地图、点位、地名、边界和地图控件，而无需接入完整的 Open Endfield Map 主站。

## 安装

```bash
npm install @opendfieldmap/sdk
```

该包仅提供 ESM，并附带 TypeScript 类型声明。宿主应用只需引入一次样式表。

## 快速开始

为宿主元素设置明确高度，然后使用具名参数创建 Widget：

```html
<div id="map" style="height: 480px"></div>
```

```ts
import { createOEMWidget } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';

const widget = await createOEMWidget('#map', {
  region: 'Valley_4',
  subregion: null,
  floor: 'M',
  locale: 'zh-CN',
  markerTypes: ['crate_i', 'aurylene'],
  labels: true,
  boundaries: false,
  markerClustering: true,
  zoom: 2,
  center: { x: 3000, y: 5000 },
  showRegionSelector: true,
  showFloorSelector: true,
  showScaleBar: true,
  lockDrag: false,
  lockZoom: false,
});

widget.destroy();
```

所有内容属性都是可选的。当前公开契约如下：

| 属性 | 类型和可接受值 | 默认值 |
| --- | --- | --- |
| `region` | `Valley_4`、`Wuling`、`Dijiang`、`Weekraid_1`，或别名 `VL`、`WL`、`DJ`、`ES` | manifest 默认地区（当前导出为 `Valley_4`） |
| `subregion` | 属于所选地区的子地区 ID，或 `null` | `null` |
| `floor` | 当前地区已发布的 `M`、`L1`–`L4` 或 `B1`–`B4` | `M` |
| `locale` | manifest 中已发布的语言；当前类型包含 `en-US`、`zh-CN`、`zh-HK`、`ja-JP`、`ko-KR`、`ru-RU`、`es-ES`、`fr-FR`、`de-DE`、`it-IT`、`id-ID`、`pt-BR`、`th-TH` 和 `vi-VN` | 最接近的浏览器语言，否则使用 manifest 回退语言（`en-US`） |
| `markerTypes` | manifest 中的类型 key 数组、`'*'`（全部）或 `false`（不显示） | 不请求 marker 数据（`false`） |
| `labels` | `true` 或 `false` | `true` |
| `boundaries` | 显示已发布的子地区 polygon 及矩形 fallback | `false` |
| `markerClustering` | 按 Atlos 规则聚合邻近且类型相同的合格 marker | `true` |
| `zoom` | 有限数字，会限制在所选地区的缩放范围内 | 地区预设值 |
| `center` | 地区像素坐标 `{ x: number, y: number }` | 地区或子地区预设值 |

`markerTypes` 使用 manifest 类型 key，而不是固定的 SDK 联合类型，因此数据发布新增类型时不需要同步发布新的包版本。空数组和 `false` 都会禁用 marker 数据；`getState()` 会将这两种选择报告为空数组。

点击点位会打开对应的 `https://oem.re/<token>` 标准页面。Widget 不包含主站侧边栏或应用状态。

## 运行时更新

内容和视图参数可直接更新，无需替换 Widget：

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

控件可见性、交互锁定、资源地址、主题和生命周期回调属于创建参数；如需修改，应重新创建 Widget。

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

## 架构

```text
宿主应用
  ├─ @opendfieldmap/sdk      Widget 生命周期与控件
  │    ├─ @opendfieldmap/map   框架无关的地图渲染器
  │    └─ @opendfieldmap/core  Manifest、资源和坐标协议
  └─ @opendfieldmap/react    可选的 React 生命周期封装

静态资源源
  └─ channel → release manifest → 版本化地图资源
```

- `@opendfieldmap/sdk` 是主要接入包。
- `@opendfieldmap/map` 提供底层 `OEM` 渲染器，适合自定义集成。
- `@opendfieldmap/core` 提供共享协议类型和资源工具。
- `@opendfieldmap/react` 管理 Widget 的创建、更新和销毁。

npm 包只包含代码、样式和控件资产；瓦片与地图数据从配置的静态资源源加载。

## 资源

默认资源源为 `https://data.opendfieldmap.org`，也可以接入完整兼容的自托管资源树：

```ts
const widget = await createOEMWidget('#map', {
  resources: {
    baseUrl: 'https://maps.example.com',
    manifestPath: '/channels/stable.json',
  },
});
```

channel 会选择 schema v1 release manifest，再由 manifest 解析所有版本化点位、地名、边界、瓦片和可选字体资源。使用方无需自行拼接单个资源地址。

## 开发

```bash
pnpm install
pnpm dev
```

实现修改完成后运行完整本地检查：

```bash
pnpm check
```

生成 npm 候选包：

```bash
pnpm pack:release
```

仓库不会自动发布 npm 包，也不会自动修改外部基础设施。

## 文档

- [Widget API](api.zh-CN.md)
- [静态资源协议](cdn-design.zh-CN.md)
- [包与发布结构](npm-release.zh-CN.md)

SDK 源码采用 AGPL-3.0-only 许可证。静态游戏资源和第三方资产可能适用其他条款。
