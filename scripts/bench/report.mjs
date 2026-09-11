import { readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'), artifacts=path.join(root,'artifacts/benchmarks');
const input=process.argv[2], name=process.argv[3]??'batch1';
if(!input)throw new Error('Usage: node scripts/bench/report.mjs measurements-file report-name');
const measurements=JSON.parse(await readFile(path.join(artifacts,input),'utf8'));
const labels=Object.keys(measurements.results);
for (const label of labels) for (const scenario of measurements.environment.scenarios ?? Object.keys(measurements.results[label])) {
  if (measurements.results[label][scenario]?.length !== measurements.environment.samples) throw new Error(`Incomplete samples: ${label}/${scenario}`);
}
const sizes=Object.fromEntries(await Promise.all(labels.map(async label=>[label,JSON.parse(await readFile(path.join(artifacts,`${label}-sizes.json`),'utf8'))])));
const percentile=(values,p)=>{const sorted=values.filter(v=>v!==null).sort((a,b)=>a-b);return sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;};
const median=(rows,key)=>percentile(rows.map(row=>row[key]),.5);
const f=n=>n===null?'—':Number(n).toFixed(2);
const bytes=n=>n.toLocaleString('en-US');
const first=labels[0],last=labels.at(-1);
const commits=Object.fromEntries(process.argv.slice(4).map(value=>value.split('=')));
for(const label of labels) if(commits[label]) sizes[label].snapshot.commit=commits[label];
const summary={environment:measurements.environment,sizes,scenarios:{}};
let md=`# ${name === 'batch1' ? '第一批补测' : '第二批'}：性能与体积报告\n\n`;
md+=`## 比较口径\n\n- 快照：${labels.map(label=>`\`${label}\`（SHA-256 \`${sizes[label].snapshot.sha256}\`）`).join('；')}。\n`;
md+=`- ${measurements.environment.os}；${measurements.environment.cpu}；Chrome ${measurements.environment.browser}；Node ${measurements.environment.node}。\n`;
md+=`- 每个场景每版 ${measurements.environment.samples} 次有效样本，另各预热 ${measurements.environment.warmups} 次；交替执行版本，每次使用新的浏览器上下文。计时为实际无头 Chrome，不是 jsdom。\n`;
md+=`- 本机 HTTP 固定数据，960×640 地图；不加载瓦片或字体网络资源。标准元数据含 1,024 顶点的边界，标签场景含 200 个标签；custom 场景按名称提供点数。200 ms 场景只延迟点击推断的边界元数据，用于验证初始化是否等待它。并非线上 CDN 延迟预测。\n`;
md+='- 初始化从调用 `createOEMWidget()`／React render 起，到创建返回／`onReady` 为止；不计调用前的 JS 模块下载。paint 为随后两帧完成的时间，仅表示绘制机会，不保证所有外部图像完成。\n';
md+='- JS 体积为 esbuild 生产压缩、ES2022、ESM 分块后的所有 JS 块之和，包含 Leaflet、聚合与输入依赖；React 场景的体积排除宿主 React。gzip level 9／Brotli quality 11 分块压缩后求和，排除 source map。CSS 单列。\n';
md+='- 小幅耗时差异可能是计时噪声；样本 p95 是经验分位值，不作为性能保证。用后堆增量包含模块／浏览器缓存，不能据此认定泄漏。\n\n## 生产体积\n\n| 入口 | '+labels.map(l=>`${l} min JS / gzip / Brotli (B)`).join(' | ')+` | ${last} 相对 ${first} gzip |\n| --- | `+labels.map(()=>'---:').join(' | ')+' | ---: |\n';
for(const entry of ['embed','full','map','react']){const a=sizes[first].consumers[entry],b=sizes[last].consumers[entry];md+=`| ${entry} | `+labels.map(l=>{const s=sizes[l].consumers[entry];return `${bytes(s.bytes)} / ${bytes(s.gzip)} / ${bytes(s.brotli)}`;}).join(' | ')+` | ${b.gzip-a.gzip>=0?'+':''}${bytes(b.gzip-a.gzip)} B (${f((b.gzip/a.gzip-1)*100)}%) |\n`;}
md+='\n| 包 | '+labels.map(l=>`${l} dist 总大小 / JS / 声明 / CSS (B)`).join(' | ')+' |\n| --- | '+labels.map(()=>'---:').join(' | ')+' |\n';
for(const pkg of ['core','map','sdk','react'])md+=`| ${pkg} | `+labels.map(l=>{const p=sizes[l].packages[pkg];return [p.distBytes,p.jsBytes,p.declarationBytes,p.cssBytes].map(bytes).join(' / ');}).join(' | ')+' |\n';
md+='\n`dist` 总大小包含 source map 和样式资源，是解包后的发布目录大小；包 JS 不包含其外部依赖，不可与上表的消费端 bundle 混用。\n';
md+='\n## 浏览器计时\n\n| 场景 | 版本 | 初始化中位 / p95 (ms) | 两帧中位 (ms) | 楼层切换中位 (ms) | 追加一点评估 (ms) | 销毁中位 (ms) | 初始 JSON 请求 |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n';
for(const scenario of Object.keys(measurements.results[first])){
 summary.scenarios[scenario]={};
 for(const label of labels){const rows=measurements.results[label][scenario];const s={};for(const key of ['readyMs','paintMs','floorMs','appendMs','destroyMs','initialRequests','customRequests','longTaskCount','longTaskMs','retainedHeapBytes'])s[key]={median:median(rows,key),p95:percentile(rows.map(r=>r[key]),.95)};summary.scenarios[scenario][label]=s;
 md+=`| ${scenario} | ${label} | ${f(s.readyMs.median)} / ${f(s.readyMs.p95)} | ${f(s.paintMs.median)} | ${f(s.floorMs.median)} | ${f(s.appendMs.median)} | ${f(s.destroyMs.median)} | ${s.initialRequests.median} |\n`;}
}
md+='\n追加一点评估保持相同最终集合：旧版通过整体 `setCustomPoints()`，新版若有 `upsertCustomPoints()` 则使用该公开增量方法。它衡量推荐调用方式的操作成本，**不是同一个实现函数的微基准**。\n';
md+='\n| 场景 | 版本 | 长任务总耗时中位 (ms) | GC 后用后堆增量中位 (B) | 自定义点 JSON 请求 |\n| --- | --- | ---: | ---: | ---: |\n';
for(const [scenario,versions] of Object.entries(summary.scenarios))for(const [label,s] of Object.entries(versions))md+=`| ${scenario} | ${label} | ${f(s.longTaskMs.median)} | ${bytes(s.retainedHeapBytes.median)} | ${s.customRequests.median} |\n`;
md+='\n## 复现与原始数据\n\n```sh\n';
for(const label of labels){
 const snapshot=sizes[label].snapshot;
 const ref=snapshot.commit??(snapshot.ref!=='working-tree'?snapshot.ref:undefined);
 if(!ref)md+=`# 在对应源代码 checkout 中捕获 ${label}；指纹见上文。\n`;
 md+=`node scripts/bench/snapshot.mjs ${label}${ref?' '+ref:''}\n`;
}
md+=`node scripts/bench/prepare.mjs ${labels.join(' ')}\nnode scripts/bench/run.mjs ${labels.join(' ')}\nnode scripts/bench/report.mjs ${input} ${name} ${Object.entries(commits).map(([label,ref])=>label+'='+ref).join(' ')}\n\`\`\`\n`;
md+='\n使用本机安装的 Google Chrome；`BENCH_SAMPLES` 可覆盖默认 15 次。快照位于被 git 忽略的 `artifacts/benchmarks/snapshots`，已存在的快照不会被覆盖。报告和原始样本保留在被忽略的 `docs/performance`，不随代码提交。JSON 包含每次请求数、计时和环境；摘要同时包含源代码指纹。\n';
const directory=path.join(root,'docs/performance');await mkdir(directory,{recursive:true});
await writeFile(path.join(directory,`${name}.md`),md);await writeFile(path.join(directory,`${name}-summary.json`),JSON.stringify(summary,null,2));await cp(path.join(artifacts,input),path.join(directory,`${name}-samples.json`));
console.log(JSON.stringify({report:`docs/performance/${name}.md`,summary:summary.scenarios},null,2));
