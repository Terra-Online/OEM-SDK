import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts/behavior-integration');
await mkdir(output, { recursive: true });
const rows = JSON.parse(await readFile(path.join(root, 'tests/fixtures/behavior.json'), 'utf8'));
const bundle = await build({
  stdin: {
    resolveDir: root,
    contents: `
import {createOEMWidget} from '@opendfieldmap/sdk';
import {behaviorManifest} from './tests/behavior-fixtures';
const nativeFrame=window.requestAnimationFrame.bind(window), nativeCancel=window.cancelAnimationFrame.bind(window);
window.frames=new Set();
window.requestAnimationFrame=callback=>{const id=nativeFrame(now=>{window.frames.delete(id);callback(now)});window.frames.add(id);return id};
window.cancelAnimationFrame=id=>{window.frames.delete(id);nativeCancel(id)};
window.paints=0;
const clear=CanvasRenderingContext2D.prototype.clearRect;
CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.classList.contains('behaviorCanvas'))window.paints++;return clear.apply(this,args)};
window.ready=(async()=>{
 const manifest=behaviorManifest();
 if(location.search.includes('missing'))manifest.behaviors.unlockIcon='/missing.svg';
 const widget=await createOEMWidget('#host',{manifest,resources:{baseUrl:location.origin,manifestPath:'/manifest'},labels:false});
 window.widget=widget; window.api=widget.map;
 window.sample=(z,x)=>{
   const canvas=document.querySelector('.behaviorCanvas');if(!canvas)return null;
   const root=document.querySelector('.mapRoot').getBoundingClientRect(),rect=canvas.getBoundingClientRect();
   const point=window.api.project({regionId:window.api.getState().regionId,x,z});
   const px=Math.round((root.x+point.x-rect.x)*canvas.width/rect.width),py=Math.round((root.y+point.y-rect.y)*canvas.height/rect.height);
   return [...canvas.getContext('2d').getImageData(px,py,1,1).data];
 };
 window.hash=()=>{
   const canvas=document.querySelector('.behaviorCanvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   let hash=2166136261;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3])hash=Math.imul(hash^pixels[i]^pixels[i+1]^pixels[i+2]^pixels[i+3],16777619);
   return hash>>>0;
 };
})();`,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  loader: { '.svg': 'text' },
  alias: Object.fromEntries(
    ['core', 'map', 'sdk'].map((name) => [
      `@opendfieldmap/${name}`,
      path.join(root, `packages/${name}/src/index.ts`),
    ]),
  ),
});
const requests = [];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  requests.push(pathname);
  const json = (value) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(value));
  };
  try {
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      return response.end(
        '<!doctype html><link rel="stylesheet" href="/style.css"><style>body{margin:0}#host{width:960px;height:640px}</style><div id="host"></div><script src="/app.js"></script>',
      );
    }
    if (pathname === '/app.js') {
      response.setHeader('Content-Type', 'text/javascript');
      return response.end(bundle.outputFiles[0].text);
    }
    if (pathname === '/index.json')
      return json(Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, '/VL_1.json'])));
    if (pathname === '/VL_1.json')
      return json([
        [1, 500, 400, 0, 0, 'crate_i'],
        [2, 520, 440, 0, 0, 'crate_i'],
        [3, 510, 430, 0, 0, 'crate_i'],
        [4, 490, 410, 0, 0, 'crate_i'],
        [5, 500, 500, 0, 0, 'crate_i'],
      ]);
    if (pathname === '/behavior/VL_1.json') return json(rows);
    if (pathname === '/bubble.svg') {
      response.setHeader('Content-Type', 'image/svg+xml');
      return response.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="20" fill="#fdff95"/></svg>',
      );
    }
    const filename = path.resolve(root, 'packages/sdk/dist', '.' + pathname);
    if (!filename.startsWith(path.join(root, 'packages/sdk/dist') + path.sep)) throw new Error('Unsafe path');
    response.setHeader(
      'Content-Type',
      filename.endsWith('.css') ? 'text/css' : filename.endsWith('.svg') ? 'image/svg+xml' : 'image/webp',
    );
    response.end(await readFile(filename));
  } catch {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const dpr of [1, 2]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: dpr });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const offset = requests.length;
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => window.ready);
    assert.equal(
      requests.slice(offset).filter((url) => url.includes('/behavior/')).length,
      0,
      'Behavior is opt-in',
    );
    const state = await page.evaluate(() => window.api.getState());
    const records = await page.evaluate(() => window.api.loadBehavior('2'));
    assert.deepEqual(
      records.map((record) => record.kind),
      ['relation', 'butterfly-path'],
    );
    assert.equal(await page.locator('.behaviorCanvas').count(), 0, 'Reading does not draw');
    await page.evaluate(() => window.widget.setBehaviorPoint('2', { animate: false, flow: false }));
    await page.waitForTimeout(100);
    let pixel = await page.evaluate(() => window.sample(500, 400));
    assert.deepEqual(pixel, [255, 252, 81, 255], 'Reverse relation endpoint uses normalized [z, x]');
    assert.deepEqual(
      await page.evaluate(() => window.api.getState()),
      state,
      'Selection leaves the camera and filters intact',
    );
    const staticPaints = await page.evaluate(() => window.paints);
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(() => window.paints),
      staticPaints,
      'Static playback must stop repainting',
    );
    await page.screenshot({ path: path.join(output, `behavior-dpr${dpr}.png`) });
    await page.evaluate(() => {
      const view = window.api.getView();
      return window.api.setView({ ...view, x: view.x + 64, z: view.z - 32 });
    });
    pixel = await page.evaluate(() => window.sample(500, 400));
    assert.deepEqual(pixel, [255, 252, 81, 255], 'Endpoint stays attached after pan');
    await page.evaluate(() => window.api.setZoom(2.5, { animate: true }));
    await page.waitForTimeout(600);
    pixel = await page.evaluate(() => window.sample(500, 400));
    assert.deepEqual(pixel, [255, 252, 81, 255], 'Endpoint stays attached after fractional animated zoom');
    await page.evaluate(() => window.widget.setBehaviorPoint('3', { animate: false, flow: false }));
    await page.waitForTimeout(100);
    assert((await page.evaluate(() => window.sample(515, 435)))[3] > 200, 'Unlock helpers are visible');
    await page.evaluate(() => window.widget.setBehaviorPoint('4', { animate: true, flow: true }));
    await page.waitForTimeout(1500);
    const first = await page.evaluate(() => window.hash());
    await page.waitForTimeout(160);
    assert.notEqual(
      await page.evaluate(() => window.hash()),
      first,
      'Trajectory directional highlight advances',
    );
    await page.evaluate(() => window.api.setBehaviorPoint(null));
    const clearedPaints = await page.evaluate(() => window.paints);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.behaviorCanvas').count(), 0);
    assert.equal(await page.evaluate(() => window.paints), clearedPaints, 'Clearing stops animation');
    assert.equal(await page.evaluate(() => window.frames.size), 0, 'No scheduled frames remain');
    await page.evaluate(() => window.api.setBehaviorPoint('2', { animate: false, flow: false }));
    assert.equal(
      requests.slice(offset).filter((url) => url === '/behavior/VL_1.json').length,
      1,
      'All selections reuse one subregion shard',
    );
    await page.evaluate(() => window.api.setRegion('Wuling'));
    assert.equal(await page.locator('.behaviorCanvas').count(), 0, 'Region changes clear behavior');
    await page.evaluate(async () => {
      await window.api.setRegion('Valley_4');
      await window.api.setBehaviorPoint('4');
    });
    await page.evaluate(() => window.widget.destroy());
    const destroyedPaints = await page.evaluate(() => window.paints);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.oemWidget').count(), 0);
    assert.equal(await page.evaluate(() => window.paints), destroyedPaints, 'Destroy stops playback');
    assert.equal(await page.evaluate(() => window.frames.size), 0, 'Destroy cancels scheduled frames');
    assert.deepEqual(errors, []);
    results.push({
      dpr,
      families: 4,
      cacheRequests: 1,
      coordinates: 'passed',
      animationAndDisposal: 'passed',
    });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/?missing`);
  await page.evaluate(() => window.ready);
  await page.evaluate(() => window.api.setBehaviorPoint('3', { animate: false, flow: false }));
  await page.waitForTimeout(100);
  assert.deepEqual(
    await page.evaluate(() => window.sample(515, 435)),
    [253, 255, 149, 255],
    'Missing unlock images retain visible helper circles',
  );
  await page.evaluate(() => window.widget.destroy());
  await page.close();
  await writeFile(
    path.join(output, 'browser-results.json'),
    JSON.stringify({ results, missingIconFallback: 'passed' }, null, 2) + '\n',
  );
  console.log(
    'Behavior browser checks passed: all families, DPR 1/2, normalized coordinates, pan/animated zoom, cache, static/flow playback, clearing/region/disposal and missing-icon fallback.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
