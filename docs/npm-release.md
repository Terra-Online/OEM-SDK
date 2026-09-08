# Package and Release Structure

Languages: English · [简体中文](npm-release.zh-CN.md) · [繁體中文（香港）](npm-release.zh-HK.md)

The repository produces ESM npm packages with TypeScript declarations. Registry publication is manual.

## Package Graph

```text
@opendfieldmap/sdk
  ├─ @opendfieldmap/core
  └─ @opendfieldmap/map
       ├─ leaflet
       ├─ leaflet.markercluster
       └─ trackpad-input

@opendfieldmap/react
  ├─ @opendfieldmap/sdk
  └─ react (peer dependency)
```

- `core` defines the schema v1 manifest contract, resource helpers, and coordinates.
- `map` contains the framework-neutral `OEM` renderer.
- `sdk` provides `createOEMWidget()` and the standard controls.
- `react` provides the optional React lifecycle wrapper.

Static map content is distributed separately from npm packages.

## Build and Verify

```bash
pnpm check
pnpm pack:release
```

`pnpm check` validates exports, types, tests, and the production Demo build. `pnpm pack:release` writes package tarballs to `artifacts/npm` without publishing them.

Before publication, verify that each tarball contains only its declared runtime files and that workspace dependency ranges resolve to publishable versions.

## Versioning

Package versions use SemVer. They are independent from:

- manifest `schemaVersion`, currently `1`;
- `gameVersion`, which groups static paths by game version;
- `releaseId`, which identifies one manifest and its immutable data objects within that game version.

A package release may support multiple game-data releases through the same schema. Tiles use stable object paths with per-tile content versions so unchanged cache keys survive a data release.

## Publish Order

1. Publish `@opendfieldmap/core`.
2. Publish `@opendfieldmap/map`.
3. Publish `@opendfieldmap/sdk`.
4. Publish `@opendfieldmap/react` when needed.
5. Install the published SDK in a blank application and run a browser smoke test.

The current packages are alpha release candidates. No command in this repository publishes to npm or mutates external infrastructure automatically.
