import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve(import.meta.dirname,'../..'), artifacts=path.join(root,'artifacts/benchmarks');
const labels=process.argv.slice(2); if(!labels.length)throw new Error('Provide prepared snapshot labels');
const samples=Number(process.env.BENCH_SAMPLES ?? 15), warmups=2;
const asset=path=>({path,sha256:'fixture',bytes:1});
const image='/pixel.svg';
const manifests={};
const points=n=>Array.from({length:n},(_,i)=>({id:`p${i}`,position:{regionId:'Valley_4',x:50+(i*73)%900,z:50+(i*137)%900,floorId:i%3?'M':'B1'},style:'framed',icon:image}));
const custom=Object.fromEntries([1000,5000,10000].map(n=>[n,points(n)]));
const boundary={count:1,boundaries:[{id:'VL_1',rings:[Array.from({length:1024},(_,i)=>({x:4000+3500*Math.cos(i*Math.PI/512),z:4000+3500*Math.sin(i*Math.PI/512)}))]}]};
function manifest(delay=0){return {schemaVersion:1,gameVersion:'1_5_3',releaseId:'benchmark',generatedAt:'2026-09-11T00:00:00Z',defaultRegionId:'Valley_4',regions:[{id:'Valley_4',name:'Valley',locales:{'en-US':'Valley'},dimensions:[8000,8000],boundsOffset:{x:0,z:0},tileSize:200,minZoom:0,maxNativeZoom:3,maxZoom:4,initialView:{regionId:'Valley_4',x:4000,z:4000,zoom:1},floors:[{id:'M',tileTemplate:'/tile/{z}/{x}/{y}.webp'},{id:'B1',tileTemplate:'/tile/b1/{z}/{x}/{y}.webp'}],subregions:[{id:'VL_1',key:'Valley',bounds:[[0,0],[8000,8000]]}],points:[],coverage:{},labels:asset('/labels.json'),boundaries:asset(`/boundary/${delay}`),gameTransform:{scaleX:1,scaleZ:1,offsetX:0,offsetZ:0}}],types:asset('/types.json'),locales:{'en-US':asset('/en.json')},controls:{'en-US':{layerSelect:'Layer',zoomIn:'Zoom in',zoomOut:'Zoom out',brandName:'OEM',termsOfService:'Terms'}},fallbackLocale:'en-US',source:{repository:'fixture',commit:'fixture',usage:'benchmark'}};}
const scenarios=['minimal','labels','boundary-200','custom-1000','custom-5000','custom-10000','react-url'];
const fixture=name=>{
 const n=name==='react-url'?1000:Number(name.split('-')[1])||0;
 const hasCustom=name.startsWith('custom-')||name==='react-url';
 return {manifest:manifest(name==='boundary-200'?200:0),options:{locale:'en-US',labels:name==='labels',...(hasCustom?{customPointsUrl:`/custom/${n}`}:{})},floor:'B1',...(hasCustom?{points:custom[n]}:{})};
};
const server=createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 try{
  if(pathname.startsWith('/fixture/'))return json(fixture(pathname.split('/').at(-1)));
  if(pathname.startsWith('/custom/'))return json(custom[pathname.split('/').at(-1)]);
  if(pathname.startsWith('/boundary/')){const delay=Number(pathname.split('/').at(-1));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));return json(boundary);}
  if(pathname==='/labels.json')return json(Array.from({length:200},(_,i)=>({id:`label${i}`,type:'site',position:{regionId:'Valley_4',x:400+(i*613)%7000,z:400+(i*389)%7000},textKey:`l${i}`})));
  if(pathname==='/en.json')return json(Object.fromEntries(Array.from({length:200},(_,i)=>[`l${i}`,`Site ${i}`])));
  if(pathname==='/types.json')return json({});
  if(pathname===image){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#777" d="M0 0h32v32H0z"/></svg>');}
  const file=path.resolve(artifacts,'serve','.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(path.join(artifacts,'serve')+path.sep)){res.statusCode=403;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'text/html');res.end(await readFile(file));
 }catch(error){res.statusCode=404;res.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--js-flags=--expose-gc']});
const result={environment:{date:new Date().toISOString(),node:process.version,os:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0].model,browser:browser.version(),viewport:{width:1000,height:720},samples,warmups,scenarios,network:'localhost; boundary-200 adds a fixed 200 ms to metadata only; no tile/font network'},results:{}};
try{
 for(const scenario of scenarios){
  for(const label of labels)result.results[label]??={};
  for(let round=-warmups;round<samples;round++){
   const order=round%2===0?labels:[...labels].reverse();
   for(const label of order){
    const context=await browser.newContext({viewport:result.environment.viewport});
    const page=await context.newPage();
    await page.goto(`${base}/${label}/`);
    await page.waitForFunction(()=>window.benchmarkReady);
    const cdp=await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const before=await cdp.send('Runtime.getHeapUsage');
    const metrics=await page.evaluate(name=>window.runBenchmark(name),scenario);
    await cdp.send('HeapProfiler.collectGarbage');
    const after=await cdp.send('Runtime.getHeapUsage');
    if(metrics.errors.length||metrics.leftoverRoots)throw new Error(`${label}/${scenario}: ${JSON.stringify(metrics)}`);
    if(round>=0)(result.results[label][scenario]??=[]).push({...metrics,retainedHeapBytes:after.usedSize-before.usedSize});
    await context.close();
   }
   if (round >= 0 && (round + 1) % 3 === 0) {
    console.log(`${scenario}: ${round + 1}/${samples} pairs`);
    await writeFile(path.join(artifacts,`measurements-${labels.join('-')}.json`),JSON.stringify(result,null,2));
   }
  }
  console.log('Measured '+scenario);
  await mkdir(artifacts,{recursive:true});
  await writeFile(path.join(artifacts,`measurements-${labels.join('-')}.json`),JSON.stringify(result,null,2));
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
