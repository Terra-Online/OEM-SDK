# 包与发布结构

语言：[English](npm-release.md) · 简体中文 · [繁體中文（香港）](npm-release.zh-HK.md)

仓库生成带 TypeScript 声明的 ESM npm 包，版本和 registry 发布使用统一的 workspace 命令。

## 依赖结构

```text
@opendfieldmap/sdk
  ├─ @opendfieldmap/core
  └─ @opendfieldmap/map
       ├─ leaflet
       ├─ leaflet.markercluster
       └─ trackpad-input

@opendfieldmap/react
  ├─ @opendfieldmap/sdk
  └─ react（peer dependency）
```

- `core` 定义 schema v1 manifest 契约、资源工具和坐标。
- `map` 包含框架无关的 `OEM` 渲染器。
- `sdk` 提供 `createOEMWidget()` 和标准控件。
- `react` 提供可选的 React 生命周期封装。

静态地图内容与 npm 包分开发行。

## 构建与检查

```bash
pnpm check
pnpm pack:release
```

`pnpm check` 检查导出、类型、测试和生产 Demo 构建。`pnpm pack:release` 把候选包写入 `artifacts/npm`，不会执行发布。

发布前应确认每个 tarball 只包含声明的运行时文件，并确认 workspace 依赖范围可以解析为可发布版本。

## 版本

npm 包使用 SemVer，并与以下版本独立：

- manifest `schemaVersion`，当前为 `1`；
- `gameVersion`，用于按游戏版本组织静态路径；
- `releaseId`，标识该游戏版本内一份 manifest 及其不可变数据对象。

同一 npm 包版本可以通过相同 schema 支持多个游戏数据 release。瓦片使用稳定对象路径和单瓦片内容版本，使未变化的缓存键可跨数据 release 复用。

使用发布助手可以一次性同步四个公开包的版本、执行 `pnpm check`、生成 tarball，并按依赖顺序发布：

```bash
pnpm release:npm --version=0.2.2-beta
pnpm release:npm --version=0.2.2-beta --publish --tag=beta
```

第一条命令只准备本地候选包；第二条命令需要 npm 登录，然后按 `core`、`map`、`sdk`、`react` 顺序统一发布。发布命令加上 `--dry-run` 可以只验证 registry 操作而不上传。

## 发布顺序

1. 发布 `@opendfieldmap/core`。
2. 发布 `@opendfieldmap/map`。
3. 发布 `@opendfieldmap/sdk`。
4. 按需发布 `@opendfieldmap/react`。
5. 在空白应用中安装已发布 SDK，并执行浏览器检查。
