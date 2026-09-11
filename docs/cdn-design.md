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
/marker/assets/{sha256}/{assetPath}.webp
/map/{gameVersion}/{releaseId}/labels/{regionId}.json
/map/{gameVersion}/{releaseId}/boundaries/{regionId}.json
/map/{gameVersion}/{releaseId}/boundaries/{regionId}.game.json
/tiles/{gameVersion}/{regionId}/{z}/{x}/{y}.webp?v={tileHash}
/tiles/{gameVersion}/{regionId}/{z}/{x}/{y}_{floorId}.webp?v={tileHash}
/fonts/harmony/{sha256}/HMSans.woff2
/fonts/novecento/{sha256}/{filename}.woff2
```

`gameVersion` uses the path-safe form of the game version, such as `1_5_3`.
`releaseId` makes the manifest, marker data, labels, and boundaries immutable.
Marker images are shared content-addressed assets under `/marker/assets/{sha256}/`; releases reference them without duplicating them.
`type.json` preserves regular marker types and exposes all source NPC and archive entries as the aggregate `npc` and `files` types respectively.
Tile object paths remain stable within a game version. The SDK adds a short
content-derived `v` value for each tile, so unchanged tiles retain their CDN
cache key across releases and only changed tiles return to origin. Omitting
`v` addresses the latest object at that stable path. Main-floor tile names have
no floor suffix; additional floors use a lowercase suffix such as `_l1`.

Consumers should provide only `baseUrl` and `manifestPath`. They should not construct individual content paths.

OEM and game boundary files share the same readable collection shape: `{ count, boundaries }`. Each boundary has an `id` and polygon `rings` made of `{ x, z }` points. The owning `regionId` is supplied by the manifest reference and is not repeated at every point. Game level-grid cells are merged by level before publication; shared internal edges are removed while the exact grid coverage remains recoverable from the merged rings.

## Hosting Contract

- Serve channel files with short-lived revalidation.
- Serve release manifests, versioned objects, and tiles requested with `v` as immutable content.
- Preserve the published `Content-Type` and object bytes.
- Allow cross-origin `GET`, `HEAD`, and `OPTIONS` requests when used by third-party sites.
- Do not replace missing tiles with opaque images; uncovered coordinates must remain transparent.

Published release directories are immutable. Tile objects are updated in place before the stable channel changes; per-tile `v` values prevent stale CDN reuse.

## R2 Release Validation

Run `pnpm update:local` to export and validate data, build the demo, and prepare one deterministic R2 plan. The generated plan records channel and manifest hashes, so `pnpm deploy:data -- --confirm-release <releaseId>` refuses stale or mixed batches. `pnpm update:demo` is the only standalone demo path; it never changes the manifest or channel. After publication, the publisher runs `pnpm validate:r2`. It compares every local object with the R2 bucket by size, fetches all manifest-declared assets through the configured CDN, verifies their bytes and SHA-256 values, and checks `Content-Type`, `Cache-Control`, and representative tile headers. It does not open a browser or perform an online smoke test.

R2 credentials may be supplied through `OEM_R2_ACCESS_KEY_ID`, `OEM_R2_ACCESS_KEY_SECRET`, and `OEM_R2_ENDPOINT`; environment variables take precedence over local configuration. Keep credentials out of the repository and CI logs.

## Custom Origins

A custom origin must mirror the same channel and manifest contract:

```ts
resources: {
  baseUrl: 'https://maps.example.com',
  manifestPath: '/channels/stable.json',
}
```

The SDK rejects absolute, protocol-relative, and parent-traversal asset paths inside manifests.
