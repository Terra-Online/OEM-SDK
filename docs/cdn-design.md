# Static Resource Protocol

Languages: English · [简体中文](cdn-design.zh-CN.md) · [繁體中文（香港）](cdn-design.zh-HK.md)

The SDK loads static content from one configurable origin. The default is `https://data.opendfieldmap.org`; no DNS, storage, or Cloudflare configuration is changed by this repository.

## Resolution Model

```text
/channels/stable.json
  → /releases/{releaseId}/manifest.json
      → immutable marker and map objects
      → stable tile objects with per-tile cache versions
```

The channel is a small updateable pointer. The schema v1 release manifest selects a complete resource set. All paths inside the manifest are relative to the configured origin.

## Public Paths

```text
/channels/stable.json
/releases/{releaseId}/manifest.json
/marker/{gameVersion}/{releaseId}/points/{subregionId}.json
/marker/{gameVersion}/{releaseId}/locales/{locale}/places.json
/marker/{gameVersion}/{releaseId}/type.json
/marker/{gameVersion}/{releaseId}/point-index.json
/marker/{gameVersion}/{releaseId}/assets/{assetPath}.webp
/map/{gameVersion}/{releaseId}/labels/{regionId}.json
/map/{gameVersion}/{releaseId}/boundaries/{regionId}.json
/tiles/{gameVersion}/{regionId}/{z}/{x}/{y}.webp?v={tileHash}
/tiles/{gameVersion}/{regionId}/{z}/{x}/{y}_{floorId}.webp?v={tileHash}
/fonts/harmony/{sha256}/HMSans.woff2
/fonts/novecento/{sha256}/{filename}.woff2
```

`gameVersion` uses the path-safe form of the game version, such as `1_5_3`.
`releaseId` makes the manifest, marker data, labels, and boundaries immutable.
`type.json` preserves regular marker types and exposes all source NPC and archive entries as the aggregate `npc` and `files` types respectively.
Tile object paths remain stable within a game version. The SDK adds a short
content-derived `v` value for each tile, so unchanged tiles retain their CDN
cache key across releases and only changed tiles return to origin. Omitting
`v` addresses the latest object at that stable path. Main-floor tile names have
no floor suffix; additional floors use a lowercase suffix such as `_l1`.

Consumers should provide only `baseUrl` and `manifestPath`. They should not construct individual content paths.

## Hosting Contract

- Serve channel files with short-lived revalidation.
- Serve release manifests, versioned objects, and tiles requested with `v` as immutable content.
- Preserve the published `Content-Type` and object bytes.
- Allow cross-origin `GET`, `HEAD`, and `OPTIONS` requests when used by third-party sites.
- Do not replace missing tiles with opaque images; uncovered coordinates must remain transparent.

Published release directories are immutable. Tile objects are updated in place before the stable channel changes; per-tile `v` values prevent stale CDN reuse.

## Custom Origins

A custom origin must mirror the same channel and manifest contract:

```ts
resources: {
  baseUrl: 'https://maps.example.com',
  manifestPath: '/channels/stable.json',
}
```

The SDK rejects absolute, protocol-relative, and parent-traversal asset paths inside manifests.
