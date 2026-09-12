import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const alias = Object.fromEntries(['core','map','sdk'].map(name => [`@opendfieldmap/${name}`, path.join(root, `packages/${name}/src/index.ts`)]));
const bundle = await build({ stdin: { resolveDir: root, contents: `
import { createOEMWidget, createClickPointTool } from '@opendfieldmap/sdk';
import { createManifest } from './tests/fixtures';
const manifest = createManifest();
window.ready = (async () => {
 const widget = await createOEMWidget('#host', { manifest, labels: false, locale: 'en-US', resources: {baseUrl: location.origin, manifestPath:'/manifest'}, customPoints: [{id:'host',position:{regionId:'Valley_4',x:430,z:500},style:'framed',icon:'/pin.svg'}] });
 window.widget = widget;
 window.api = widget.map;
 window.clicks = [];
 window.activations = [];
 window.enters = [];
 widget.on('click', e => window.clicks.push(e));
 widget.on('pointclick', e => { window.activations.push({source:e.source,trigger:e.trigger,id:e.point.id}); if(window.cancelNavigation)e.preventDefault(); });
 widget.on('pointenter', e => window.enters.push(e.point.id));
 await widget.map.update({markerTypes:'*'});
 window.startTool = () => window.tool = createClickPointTool(widget.map, {mode:'multiple',style:'framed',icon:'/pin.svg'});
})();` }, bundle:true,write:false,format:'iife',target:'es2022',loader:{'.svg':'text'},alias });
const server = createServer(async (request,response) => {
  const pathname = new URL(request.url,'http://localhost').pathname;
  const json = value => { response.setHeader('Content-Type','application/json');response.end(JSON.stringify(value)); };
  try {
    if (pathname === '/') { response.setHeader('Content-Type','text/html'); return response.end('<!doctype html><link rel="stylesheet" href="/style.css"><style>body{margin:0}#host{width:960px;height:640px}</style><div id="host"></div><script src="/app.js"></script>'); }
    if (pathname === '/app.js') { response.setHeader('Content-Type','text/javascript'); return response.end(bundle.outputFiles[0].text); }
    if (pathname === '/VL_1.json') return json([['2100500004',500,550,0,0,'crate_i']]);
    if (pathname === '/types.json') return json({crate_i:{key:'crate_i',icon:'/pin.svg',category:{main:'item',sub:'item'}}});
    if (pathname === '/pin.svg') {response.setHeader('Content-Type','image/svg+xml'); return response.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#777" d="M0 0h32v32H0z"/></svg>');}
    const file=path.resolve(root,'packages/sdk/dist','.'+pathname);
    if(!file.startsWith(path.join(root,'packages/sdk/dist')+path.sep))throw new Error('Bad path');
    response.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'image/webp');response.end(await readFile(file));
  }catch{response.statusCode=404;response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1000,height:720}});
await context.route('https://oem.re/**', route=>route.fulfill({contentType:'text/html',body:'<p>Navigation test</p>'}));
const page=await context.newPage(), errors=[]; page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.evaluate(()=>window.ready);
  const published=page.locator('[data-oem-point^="published:"]');
  await published.waitFor({state:'visible',timeout:3000});
  const [popup]=await Promise.all([context.waitForEvent('page', { timeout: 5000 }),published.click()]);
  await popup.waitForLoadState(); assert.match(popup.url(),/^https:\/\/oem.re\//); await popup.close();
  assert.equal(await page.evaluate(()=>window.clicks.length),0);
  await page.evaluate(()=>window.cancelNavigation=true);
  let unwantedPopup=false; page.on('popup', popup=>{unwantedPopup=true;void popup.close();});
  await published.click(); await page.waitForTimeout(100); assert.equal(unwantedPopup,false);
  const custom=page.locator('[data-oem-point="custom:host"]');
  await custom.hover(); await custom.click(); await custom.focus(); await page.keyboard.press('Enter');
  const interaction=await page.evaluate(()=>({clicks:window.clicks.length,activations:window.activations,enters:window.enters}));
  assert.equal(interaction.clicks,0); assert(interaction.enters.includes('host'));
  assert(interaction.activations.some(event=>event.source==='custom'&&event.trigger==='pointer'));
  assert(interaction.activations.some(event=>event.source==='custom'&&event.trigger==='keyboard'));
  const geometry=await custom.evaluate(element=>{const icon=element.closest('.frameMarkerIcon');return {width:icon.style.width,height:icon.style.height,left:icon.style.marginLeft,top:icon.style.marginTop};});
  assert.deepEqual(geometry,{width:'32px',height:'32px',left:'-16px',top:'-32px'});
  await page.evaluate(()=>window.api.setInteractionLocks({lockZoom:true}));
  assert.equal(await page.locator('.zoomIn').isDisabled(),true);
  await page.evaluate(()=>window.api.setZoom(3)); assert.equal(await page.evaluate(()=>window.widget.getState().zoom),3);
  await page.evaluate(()=>window.api.setInteractionLocks({lockZoom:false}));
  await page.evaluate(()=>window.startTool());
  await page.mouse.click(800,480); await page.mouse.click(820,500);
  await page.waitForFunction(()=>window.tool.getPoints().length===2);
  await page.evaluate(()=>window.tool.clear());
  assert.deepEqual(await page.evaluate(()=>window.api.getCustomPoints().map(p=>p.id)),['host']);
  await page.evaluate(()=>window.tool.destroy());
  await page.mouse.click(840,520);
  assert.equal(await page.evaluate(()=>window.api.getCustomPoints().length),1);
  const saved=await page.evaluate(()=>JSON.stringify(window.clicks.at(-1)));
  const record=JSON.parse(saved); assert.equal(record.mapPosition.space,'map'); assert.equal(record.pixelPosition.space,'pixel');
  await mkdir(path.join(root,'artifacts/browser'),{recursive:true});
  await page.screenshot({path:path.join(root,'artifacts/browser/official-widget.png')});
  await page.evaluate(()=>window.api.destroy()); assert.equal(await page.locator('.oemWidget').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: default/cancelled navigation, pointer/keyboard events, fixed icon dimensions, shared locks/state, tool ownership and disposal, coordinate persistence.');
} catch(error) {
 console.error(await page.evaluate(()=>({resources:Object.fromEntries(Object.entries(window.api.getResourceState()).map(([k,v])=>[k,{status:v.status,error:v.error?.message}])),activations:window.activations,clicks:window.clicks,anchors:[...document.querySelectorAll('[data-oem-point]')].map(e=>({tag:e.tagName,href:e.href,target:e.target,rect:e.getBoundingClientRect().toJSON()}))})),errors,context.pages().map(p=>p.url()));
 throw error;
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
