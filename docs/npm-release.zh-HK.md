# 套件與發佈結構

語言：[English](npm-release.md) · [简体中文](npm-release.zh-CN.md) · 繁體中文（香港）

倉庫產生附帶 TypeScript 聲明的 ESM npm 套件，registry 發佈由維護者手動執行。

## 依賴結構

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

- `core` 定義 schema v1 manifest 契約、資源工具和座標。
- `map` 包含框架無關的 `OEM` 渲染器。
- `sdk` 提供 `createOEMWidget()` 和標準控制項。
- `react` 提供可選的 React 生命週期封裝。

靜態地圖內容與 npm 套件分開發佈。

## 建置與檢查

```bash
pnpm check
pnpm pack:release
```

`pnpm check` 檢查匯出、類型、測試和生產 Demo 建置。`pnpm pack:release` 把候選套件寫入 `artifacts/npm`，不會執行發佈。

發佈前應確認每個 tarball 只包含聲明的執行時檔案，並確認 workspace 依賴範圍可以解析為可發佈版本。

## 版本

npm 套件使用 SemVer，並與以下版本獨立：

- manifest `schemaVersion`，目前為 `1`；
- `gameVersion`，用於版本化靜態路徑；
- `releaseId`，識別一套完整靜態資源。

同一 npm 套件版本可以透過相同 schema 支援多個不可變遊戲資料版本。

## 發佈順序

1. 發佈 `@opendfieldmap/core`。
2. 發佈 `@opendfieldmap/map`。
3. 發佈 `@opendfieldmap/sdk`。
4. 按需發佈 `@opendfieldmap/react`。
5. 在空白應用程式中安裝已發佈 SDK，並執行瀏覽器 smoke test。

目前套件屬於 alpha 候選版本。倉庫中的命令不會自動發佈 npm，也不會修改外部基礎設施。
