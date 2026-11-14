import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

// Compare renderer revisions with identical SDK code, data, dependencies and styles.
const root = path.resolve(import.meta.dirname, '..');
const baseline = process.argv[2];
if (!baseline) throw new Error('Usage: node scripts/verify-canvas.mjs <baseline-git-ref>');
const baselineCommit = execFileSync('git', ['rev-parse', '--verify', `${baseline}^{commit}`], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const output = path.join(root, 'artifacts/canvas-performance');
await mkdir(output, { recursive: true });
const bundles = {};
for (const variant of ['before', 'after']) {
  const result = await build({
    stdin: {
      resolveDir: root,
      contents: `
import L from 'leaflet';
import {createOEM} from '@opendfieldmap/map';
import {createManifest} from './tests/fixtures';
import {existingCanvasSurface} from './packages/map/src/atlos/canvas/canvasMarkerSurface';
let map;
L.Map.addInitHook(function(){map=this});
window.createScene = async (count, dense) => {
  const manifest=createManifest();
  const side=Math.ceil(Math.sqrt(count)), span=dense?100:1000;
  const points=Array.from({length:count},(_,i)=>({id:'point-'+i,
    position:{regionId:'Valley_4',x:500-span/2+((i%side)+.5)*span/side,
      z:500-span/2+(Math.floor(i/side)+.5)*span/side,floorId:i%2?'M':'B1'},
    style:i%4===0?'no-frame':'framed',icon:'/pin.svg'}));
  const api=await createOEM(document.querySelector('#host'),{
    manifest,resources:{baseUrl:location.origin,manifestPath:'/manifest'},locale:'en-US',
    features:{labels:false,points:false},customPoints:points,markerClustering:false,
  });
  const frame=()=>new Promise(requestAnimationFrame);
  await new Promise(r=>setTimeout(r,450)); await frame();
  const surface=existingCanvasSurface(map);
  window.scene={api,map,surface,points,frame};
  if(surface.entries.size!==count)throw Error('Missing logical points');
  return surface.getRendererStats().backend;
};`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    minify: true,
    target: 'es2022',
    loader: { '.svg': 'text' },
    alias: {
      leaflet: path.join(root, 'packages/map/node_modules/leaflet/dist/leaflet-src.js'),
      '@opendfieldmap/core': path.join(root, 'packages/core/src/index.ts'),
      '@opendfieldmap/map': path.join(root, 'packages/map/src/index.ts'),
    },
    plugins:
      variant === 'before'
        ? [
            {
              name: 'baseline-renderer',
              setup(builder) {
                builder.onLoad(
                  { filter: /packages\/map\/src\/atlos\/canvas\/.*\.ts$/ },
                  ({ path: filename }) => ({
                    contents: execFileSync(
                      'git',
                      ['show', `${baselineCommit}:${path.relative(root, filename)}`],
                      {
                        cwd: root,
                        encoding: 'utf8',
                      },
                    ),
                    loader: 'ts',
                    resolveDir: path.dirname(filename),
                  }),
                );
              },
            },
          ]
        : [],
  });
  bundles[variant] = result.outputFiles[0].text;
}
const css = await readFile(path.join(root, 'packages/sdk/dist/style.css'));
const assets = new Map(
  await Promise.all(
    ['marker-hover.webp', 'marker-select.webp', 'map-pattern.svg'].map(async (name) => [
      `/assets/${name}`,
      await readFile(path.join(root, 'packages/sdk/dist/assets', name)),
    ]),
  ),
);
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/app.js') {
    response.setHeader('Content-Type', 'text/javascript');
    return response.end(bundles[url.searchParams.get('variant')]);
  }
  if (url.pathname === '/style.css') {
    response.setHeader('Content-Type', 'text/css');
    return response.end(css);
  }
  if (assets.has(url.pathname)) {
    response.setHeader('Content-Type', url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/webp');
    return response.end(assets.get(url.pathname));
  }
  if (url.pathname === '/pin.svg') {
    response.setHeader('Content-Type', 'image/svg+xml');
    return response.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#888" d="M16 3 29 16 16 29 3 16Z"/></svg>',
    );
  }
  if (url.pathname.endsWith('.json')) {
    response.setHeader('Content-Type', 'application/json');
    return response.end('{}');
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(
    `<link rel="stylesheet" href="/style.css"><style>body{margin:0}#host{width:960px;height:640px}</style><div id="host"></div><script src="/app.js?variant=${url.searchParams.get('variant')}"></script>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const samples = Number(process.env.BENCH_SAMPLES ?? 5);
assert(Number.isInteger(samples) && samples >= 0, 'BENCH_SAMPLES must be a nonnegative integer');
const regression = [];
const fallback = [];
const summary = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};
async function open(variant, backend, dpr = 2) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: dpr });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (backend === 'canvas2d')
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === 'webgl2' ? null : getContext.call(this, type, ...args);
      };
    });
  await page.goto(`http://127.0.0.1:${server.address().port}/?variant=${variant}`);
  return { page, errors };
}
try {
  for (const backend of ['canvas2d', 'webgl2']) {
    for (const [count, dense] of [
      [1000, false],
      [5000, false],
      [10000, false],
      [5000, true],
    ]) {
      // One warmup, then alternate version order to limit ordering and thermal bias.
      for (let sample = samples ? -1 : 0; sample < samples; sample++) {
        for (const variant of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
          const { page, errors } = await open(variant, backend);
          try {
            assert.equal(await page.evaluate(([n, d]) => window.createScene(n, d), [count, dense]), backend);
            const measured = await page.evaluate(async () => {
              const { api, map, surface, frame } = window.scene;
              const count = surface.entries.size;
              let paints = 0;
              const target = surface.batch ?? surface.context;
              const key = surface.batch ? 'begin' : 'clearRect';
              const original = target[key];
              target[key] = function (...args) {
                paints++;
                return original.apply(this, args);
              };
              const measure = async (zoom) => {
                if (zoom) map._moveStart(true, false);
                const cpu = [],
                  frames = [];
                let previous = await frame();
                const before = paints;
                for (let i = 0; i < 40; i++) {
                  const start = performance.now();
                  if (zoom)
                    map._move(map.getCenter(), 2 + 0.25 * Math.sin((i / 39) * Math.PI), {
                      pinch: true,
                      round: false,
                    });
                  else map.panBy([i < 20 ? 3 : -3, 0], { animate: false });
                  cpu.push(performance.now() - start);
                  const now = await frame();
                  frames.push(now - previous);
                  previous = now;
                }
                if (zoom) map._moveEnd(true);
                return { cpu, frames, paints: paints - before };
              };
              const pan = await measure(false),
                zoom = await measure(true);
              if (surface.entries.size !== count) throw Error('Lost points while browsing');
              api.destroy();
              if (document.querySelector('.oem-canvas-markers,.oem-canvas-semantics'))
                throw Error('Leaked renderer');
              return { pan, zoom };
            });
            assert.deepEqual(errors, []);
            if (sample >= 0) results.push({ backend, count, dense, variant, sample, ...measured });
          } finally {
            await page.close();
          }
        }
      }
      console.log(JSON.stringify({ measured: { backend, count, dense, samples } }));
    }
    for (const dpr of [1.25, 2]) {
      const { page, errors } = await open('after', backend, dpr);
      try {
        assert.equal(await page.evaluate(() => window.createScene(64, true)), backend);
        const checks = await page.evaluate(async () => {
          const { api, map, surface, points, frame } = window.scene;
          const markers = [...surface.entries.keys()],
            nodes = markers.map((m) => m.getElement());
          const first = markers[0];
          let clicks = 0,
            blankClicks = 0;
          api.on('pointclick', (e) => {
            e.preventDefault();
            clicks++;
          });
          api.on('click', () => blankClicks++);
          const activate = () => {
            const p = map.latLngToContainerPoint(first.getLatLng());
            const rect = map.getContainer().getBoundingClientRect();
            map.getContainer().dispatchEvent(
              new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: rect.x + p.x,
                clientY: rect.y + p.y - 12,
              }),
            );
          };
          activate();
          map.panBy([20, 8], { animate: false });
          activate();
          if (clicks !== 2 || blankClicks) throw Error('Hit ownership changed');
          for (const [center, zoom] of [
            [[540, 580], 3],
            [[500, 500], 2],
          ]) {
            map.setView(center, zoom, { animate: false });
            await frame();
          }
          map.setZoom(2.5, { animate: true });
          await new Promise((r) => setTimeout(r, 350));
          map.setZoom(2, { animate: false });
          await api.setFloor('B1');
          await api.setFloor('M');
          if (markers.some((m, i) => m.getElement() !== nodes[i])) throw Error('Node identity changed');
          await api.removeCustomPoints(points.slice(0, 16).map((p) => p.id));
          await api.upsertCustomPoints(points.slice(0, 16));
          await frame();
          await frame();
          if (api.getCustomPoints().length !== 64) throw Error('Point updates lost data');
          const canvas = document.querySelector('.oem-canvas-markers');
          const ratio = Math.max(2, devicePixelRatio);
          if (canvas.width * canvas.height > 960 * 640 * ratio ** 2 * 1.5)
            throw Error('Backing budget exceeded');
          const p = map.latLngToContainerPoint(first.getLatLng());
          const offset = surface.viewportOffset ?? { x: 0, y: 0 };
          const pixels = surface.readPixels(
            Math.round((p.x + offset.x - 12) * ratio),
            Math.round((p.y + offset.y - 20) * ratio),
            Math.round(24 * ratio),
            Math.round(24 * ratio),
          );
          if (!pixels.some((v, i) => i % 4 === 3 && v > 0)) throw Error('Point became blank');
          return { clicks, blankClicks, identity: true, points: 64, backingBudget: true, visible: true };
        });
        await page.screenshot({ path: path.join(output, `${backend}-dpr${dpr}.png`) });
        await page.evaluate(() => window.scene.api.destroy());
        assert.deepEqual(errors, []);
        regression.push({ backend, dpr, ...checks });
      } finally {
        await page.close();
      }
    }
  }
  for (const reason of ['context-loss', 'image-cors']) {
    const { page, errors } = await open('after', 'webgl2');
    try {
      assert.equal(await page.evaluate(() => window.createScene(16, true)), 'webgl2');
      if (reason === 'context-loss') {
        await page.evaluate(() => {
          window.scene.surface.batch.gl.getExtension('WEBGL_lose_context').loseContext();
        });
      } else {
        // Same local server on another hostname deliberately supplies no CORS grant.
        await page.evaluate(async () => {
          await window.scene.api.upsertCustomPoints([
            {
              id: 'cors-image',
              position: { regionId: 'Valley_4', x: 500, z: 500 },
              style: 'framed',
              icon: 'http://localhost:' + location.port + '/pin.svg',
            },
          ]);
        });
      }
      await page.waitForFunction(
        () =>
          window.scene.surface.getRendererStats().backend === 'canvas2d' && !window.scene.surface.pendingSwap,
      );
      const retained = await page.evaluate(() => window.scene.api.getCustomPoints().length);
      assert.equal(retained, reason === 'image-cors' ? 17 : 16);
      await page.screenshot({ path: path.join(output, `${reason}.png`) });
      await page.evaluate(() => window.scene.api.destroy());
      assert.equal(await page.locator('.oem-canvas-markers,.oem-canvas-semantics').count(), 0);
      assert.deepEqual(errors, []);
      fallback.push({ reason, points: retained, backend: 'canvas2d', cleanedUp: true });
    } finally {
      await page.close();
    }
  }
} finally {
  const browserVersion = browser.version();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  const aggregated = [];
  for (const backend of ['canvas2d', 'webgl2'])
    for (const count of [1000, 5000, 10000])
      for (const dense of [false, true])
        for (const variant of ['before', 'after']) {
          const group = results.filter(
            (r) => r.backend === backend && r.count === count && r.dense === dense && r.variant === variant,
          );
          if (!group.length) continue;
          aggregated.push({
            backend,
            count,
            dense,
            variant,
            samples: group.length,
            panCpuMs: summary(group.flatMap((r) => r.pan.cpu)),
            zoomCpuMs: summary(group.flatMap((r) => r.zoom.cpu)),
            panFrameMs: summary(group.flatMap((r) => r.pan.frames)),
            panPaints: summary(group.map((r) => r.pan.paints)),
          });
        }
  await writeFile(
    path.join(output, samples ? 'results.json' : 'regression.json'),
    JSON.stringify(
      {
        baselineCommit,
        browserVersion,
        generatedAt: new Date().toISOString(),
        rendererHash: createHash('sha256')
          .update(
            (
              await Promise.all(
                ['canvasMarkerSurface.ts', 'canvasMarkerPaint.ts', 'canvasViewport.ts'].map((name) =>
                  readFile(path.join(root, 'packages/map/src/atlos/canvas', name)),
                ),
              )
            )
              .map((bytes) => bytes.toString())
              .join('\n'),
          )
          .digest('hex'),
        complete: regression.length === 4 && fallback.length === 2 && results.length === 16 * samples,
        regression,
        fallback,
        aggregated,
        samples: results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ regression, fallback, aggregated }, null, 2));
}
