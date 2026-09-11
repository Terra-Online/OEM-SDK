import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile, cp } from 'node:fs/promises';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const artifacts = path.join(root, 'artifacts/benchmarks');
const files = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async item => item.isDirectory() ? files(path.join(directory,item.name)) : path.join(directory,item.name)))).flat();
for (const label of process.argv.slice(2)) {
  const snapshot = path.join(artifacts, 'snapshots', label);
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: snapshot, stdio: 'inherit' });
  const alias = Object.fromEntries(['core','map','sdk','react'].map(name => [`@opendfieldmap/${name}`,path.join(snapshot, `packages/${name}/src/index.${name === 'react' ? 'tsx' : 'ts'}`)]));
  const output = path.join(artifacts,'serve',label);
  await mkdir(output,{recursive:true});
  const metadata = JSON.parse(await readFile(path.join(snapshot,'snapshot.json'),'utf8'));
  const sizes = { snapshot: metadata, consumers: {}, packages: {} };
  for (const [name,contents] of Object.entries({ embed: "export { createOEMWidget } from '@opendfieldmap/sdk';", full: "export * from '@opendfieldmap/sdk';", map: "export { createOEM } from '@opendfieldmap/map';", react: "export { OEMWidget } from '@opendfieldmap/react';" })) {
    const result = await build({ stdin:{contents,resolveDir:root,sourcefile:'consumer.ts'},alias,bundle:true,format:'esm',splitting:true,minify:true,target:'es2022',outdir:path.join(output,name),write:false,loader:{'.svg':'text'},external:['react','react-dom','react-dom/client'],metafile:true });
    const js=result.outputFiles.filter(file=>file.path.endsWith('.js'));
    sizes.consumers[name]={bytes:js.reduce((n,f)=>n+f.contents.length,0),gzip:js.reduce((n,f)=>n+gzipSync(f.contents,{level:9}).length,0),brotli:js.reduce((n,f)=>n+brotliCompressSync(f.contents,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).length,0),chunks:js.length};
  }
  for (const name of ['core','map','sdk','react']) {
    const values={distBytes:0,jsBytes:0,declarationBytes:0,cssBytes:0,cssGzip:0};
    for(const file of await files(path.join(snapshot,'packages',name,'dist'))){const bytes=await readFile(file);values.distBytes+=bytes.length;if(file.endsWith('.js'))values.jsBytes+=bytes.length;if(file.endsWith('.d.ts'))values.declarationBytes+=bytes.length;if(file.endsWith('.css')){values.cssBytes+=bytes.length;values.cssGzip+=gzipSync(bytes,{level:9}).length;}}
    sizes.packages[name]=values;
  }
  await build({entryPoints:[path.join(root,'scripts/bench/browser.ts')],alias,bundle:true,format:'esm',splitting:true,minify:true,target:'es2022',outdir:output,loader:{'.svg':'text'},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
  await cp(path.join(snapshot,'packages/sdk/dist/style.css'),path.join(output,'style.css'));
  await cp(path.join(snapshot,'packages/sdk/dist/assets'),path.join(output,'assets'),{recursive:true});
  await writeFile(path.join(output,'index.html'),`<!doctype html><link rel="stylesheet" href="./style.css"><style>html,body{margin:0}</style><script type="module" src="./browser.js"></script>`);
  await writeFile(path.join(artifacts,`${label}-sizes.json`),JSON.stringify(sizes,null,2));
  console.log(JSON.stringify({label,consumers:sizes.consumers}));
}
