# 配置与职责治理（第三批）

本批保持四包结构和现有扁平 API，集中配置规范、更新协调和 React 同步。官方视觉继续固定，不增加主题变量、字体、尺寸、锚点或渲染器入口。可信 CDN 仍只检查 Manifest schema 版本，不增加初始化数据扫描。

## API 增量与兼容

`createOEMWidget()`、`widget.setOptions()` 和 `widget.map.update()` 支持可选分组写法；原有扁平字段继续有效。

```ts
await widget.setOptions({
  view: { region: 'VL', floor: 'M', center: { x: 3200, z: -4800 } },
  layers: { markerTypes: ['crate_i'], labels: true },
  interaction: { lockDrag: false, lockZoom: false },
  controls: { showScaleBar: true, horizontalSelectors: true },
  theme: 'dark',
});
const state = widget.map.getState(); // 解析后的实际地图状态
const controls = widget.getControlState(); // 官方控件配置的独立快照
```

- `view`：region、subregion、floor、zoom、center。center 单位是发布像素。
- `layers`：locale、markerTypes、labels、boundaries、boundarySource、markerClustering。
- `interaction`：lockDrag、lockZoom。
- `controls`：仅 Widget，包含 showRegionSelector、showFloorSelector、showScaleBar、horizontalSelectors；现在均可动态更新。
- 同时提供分组和扁平字段时，已定义的扁平值优先。省略／undefined 保持，数组整体替换；仅 subregion 接受 null 清除，清空自定义点使用 customPoints: []。customPoints 与 customPointsUrl 不可同时提供。
- 分组只接受对应组中的字段。旧 `createOEM(container, OEMOptions)` 创建契约保持不变，尤其其 `view` 仍是旧 OEMView；创建后通过 map.update 使用分组配置。
- 必要资源或配置失败不提交该次配置；可选图层失败通过资源状态／错误报告，地图保持可用。`setOptions()` 完成时对应控件已应用；地图 statechange 仅描述地图状态，不代表控件配置提交事件。
- 地区、楼层和语言接受 Manifest 定义的值；保留常见标识的类型补全和地区别名，精确地区 ID 优先于别名。新地区缺少内置图标时使用官方通用图标；没有 M 层时以 Manifest 第一层为默认层。

新增 `snapshotOEMWidgetConfig`、`diffOEMWidgetConfig` 以及 map 包的对应工具，供宿主适配器复用相同的快照与语义比较规则。`OEM_MAP_DEFAULTS`、`OEM_WIDGET_CONTROL_DEFAULTS`、`OEM_REGION_ALIASES` 和配置字段表可复用；其中默认值仅覆盖固定公共配置，地区／语言／视图仍由 Manifest 和上下文解析。`snapshotOEMMapConfig` 负责选取和复制，校验可独立调用 `validateOEMMapConfig`；Widget 快照会先校验。

`parseOEMUrlState` 保留旧行为：省略 s 产生 subregion: null。新增 `parseOEMUrlPatch` 适用于对现有地图应用 URL：省略的字段保持原状态。原有 URL 键／别名保留，并支持官方主题、交互锁和控件布尔参数。

命名明确的 `pixelToMapPosition`、`mapToPixelPosition`、`gameXZToMapPosition`、`pixelToGameXZPosition` 返回值现在附带必填 space 标识。新增 `OEMNormalizedMapPosition`，与 `OEMPixelPosition` 在类型上区分。旧 `OEMMapPosition`／`OEMPosition` 仍接受无标识数据，旧 toOEMMapPosition／fromOEMMapPosition 等函数返回形状不变；依赖对象精确枚举／序列化的调用者需留意新函数新增的 space 字段。历史数据不改写。

## React

```tsx
const ref = useRef<OEMWidgetHandle>(null); // SDK 的 OEMWidget 类型别名
return <OEMWidget
  key={releaseId}
  ref={ref}
  options={{ resources, layers: { markerTypes: ['crate_i'] } }}
  onReady={widget => console.log(widget.map.getState())}
  onMapClick={position => save(position)}
  onError={reportError}
/>;
```

ref 在就绪后指向 Widget，卸载／销毁后为 null。onReady 使用传入的 Widget 参数，回调执行时 React 不一定已提交 ref。resources／manifest／signal 按每次挂载固定，变化时通过 key 重建；className（options 内）同样属于创建配置，外层 className／style 仍用于宿主容器布局。

地图业务配置和官方控件选项通过共享语义 diff 同步，内容相同的新数组／center 不重复提交。按 React 常规方式使用不可变 options；删除字段／undefined 不重置地图。初始化中变化的动态参数会在就绪时补齐。独立事件 props 始终读取最新回调：onMapClick、onPointClick、onPointEnter、onPointLeave、onViewChange、onRegionChange、onFloorChange、onCustomPointsChange、onResourceChange、onLoading、onLoad、onDestroy，另有 onReady／onStateChange／onError；后三者优先于旧 options 回调。事件从实例就绪时订阅，不回放创建期间的 loading；组件卸载会先解除订阅，onDestroy 用于仍挂载时的实例销毁。

## 职责和组合命令来源

| 入口／模块 | 实际调用与职责 | 源文件 |
| --- | --- | --- |
| core | 数据类型、Manifest 读取／语言解析、纯坐标转换、快照和错误 | packages/core/src/manifest.ts、coordinates.ts、snapshot.ts |
| 配置规范 | 默认值、字段归属、校验类别、状态映射、URL 键、语义比较 | packages/map/src/configSpec.ts、config.ts |
| 更新协调 | 顺序执行、取消、失败后恢复、统一状态通知 | packages/map/src/runtime/coordinator.ts |
| 资源仓库 | 实例内缓存和请求去重，失败可重试，销毁释放 | packages/map/src/runtime/repository.ts |
| Leaflet 适配 | OEM 所有的私有方法依赖集中在适配边界 | packages/map/src/runtime/leafletAdapter.ts |
| Widget 选择器／缩放 | map.update／map.setZoom；控件读取 map 的 statechange | packages/sdk/src/widget.ts、components/ |
| widget.setOptions | map.update → 成功后更新官方控件；无第二份地图业务状态 | packages/sdk/src/widget.ts |
| 点击点工具 | on(click/custompointschange/destroy) + getCustomPoint/upsertCustomPoints/removeCustomPoints | packages/sdk/src/tools/clickPoints.ts |
| React | createOEMWidget + setOptions + 公开事件；ref.map 仍是同一接口 | packages/react/src/index.tsx |
| Demo | 复用公共默认值／地区别名／URL patch／setOptions；仅数据源切换重建 | examples/basic/main.ts、configPanel.ts |

Canvas／Atlos 渲染实现保持原边界，本批不改渲染策略。开发与包构建共同使用 scripts/styles.mjs，统一 CSS 作用域、动画命名和资源路径；CSS 变量仅为内部实现。

## 开发命令和新增参数流程

命令定义均来自根 package.json：

| 命令 | 组合来源 |
| --- | --- |
| pnpm check:code | lint → format:check → typecheck → test → build |
| pnpm lint | eslint.config.mjs：ESLint + TypeScript 推荐规则与 Prettier 兼容配置 |
| pnpm format / format:check | .prettierrc.json、.prettierignore；写入／只检查 |
| pnpm typecheck / test | tsconfig.json／vitest.config.ts |
| pnpm build | scripts/build.mjs，四包 ESM + 声明 + 共用样式管线 |

原 check／release 命令保持原组合。本批不引入 benchmark 到检查命令。借用的 packages/map/src/atlos、静态资产和本地性能报告不参与本批自动格式整理。

新增参数时：声明类型 → 在 configSpec 注册归属／校验类别／状态映射及可选 URL 键 → 定义默认值和动态更新影响 → 在状态协调流程实现必要加载及失败行为 → 添加最小调用例与针对性回归。React 和 URL 适配不再各自维护地图字段白名单；特殊资源输入仍需显式定义加载语义。
