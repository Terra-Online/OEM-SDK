# Static Resource Protocol

Languages: English · [简体中文](cdn-design.zh-CN.md) · [繁體中文（香港）](cdn-design.zh-HK.md)

The SDK loads static content from one configurable origin. The default is `https://data.opendfieldmap.org`; no DNS, storage, or Cloudflare configuration is changed by this repository.

## Resolution Model

```text
/channels/stable.json
  → /releases/{releaseId}/manifest.json
      → versioned marker, map, tile, and font objects
```

The channel is a small updateable pointer. The schema v1 release manifest selects a complete resource set. All paths inside the manifest are relative to the configured origin.

## Public Paths

```text
/channels/stable.json
/releases/{releaseId}/manifest.json
/marker/{gameVersion}/points/{subregionId}.json
/marker/{gameVersion}/locales/{locale}/places.json
/marker/{gameVersion}/types.json
/marker/{gameVersion}/point-index.json
/marker/{gameVersion}/assets/{assetPath}.webp
/map/{gameVersion}/labels/{regionId}.json
/map/{gameVersion}/boundaries/{regionId}.json
/tiles/{gameVersion}/{regionId}/{z}/{x}/{y}.webp
/tiles/{gameVersion}/{regionId}/{z}/{x}/{y}_{floorId}.webp
/fonts/novecento/{sha256}/{filename}.woff2
```

`gameVersion` uses the path-safe form of the game version, such as `1_5_3`. Main-floor tile names have no floor suffix; additional floors use a lowercase filename suffix such as `_l1`.

Consumers should provide only `baseUrl` and `manifestPath`. They should not construct individual content paths.

## Hosting Contract

- Serve channel files with short-lived revalidation.
- Serve release manifests and versioned objects as immutable content.
- Preserve the published `Content-Type` and object bytes.
- Allow cross-origin `GET`, `HEAD`, and `OPTIONS` requests when used by third-party sites.
- Do not replace missing tiles with opaque images; uncovered coordinates must remain transparent.

Published game-version directories are immutable. Rollback changes the channel pointer to an earlier compatible release.

## Custom Origins

A custom origin must mirror the same channel and manifest contract:

```ts
resources: {
  baseUrl: 'https://maps.example.com',
  manifestPath: '/channels/stable.json',
}
```

The SDK rejects absolute, protocol-relative, and parent-traversal asset paths inside manifests.
