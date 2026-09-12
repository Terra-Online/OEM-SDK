import { build } from 'esbuild';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as sass from 'sass';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'packages/map/package.json'));
for (const name of ['core', 'map', 'sdk', 'react']) {
  const directory = path.join(root, `packages/${name}`);
  await fs.rm(path.join(directory, 'dist'), { recursive: true, force: true });
  await build({ entryPoints: [path.join(directory, `src/index.${name === 'react' ? 'tsx' : 'ts'}`)],
    outdir: path.join(directory, 'dist'), bundle: true, splitting: true, format: 'esm', target: 'es2022',
    sourcemap: true, packages: 'external', loader: { '.svg': 'text' }, tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } } });
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile).config;
  delete config.compilerOptions.paths;
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, root, {
    declaration: true, emitDeclarationOnly: true, rootDir: path.join(directory, 'src'), outDir: path.join(directory, 'dist'),
  });
  const files = ts.sys.readDirectory(path.join(directory, 'src'), ['.ts', '.tsx']);
  const program = ts.createProgram(files, parsed.options);
  const result = program.emit();
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: (filename) => filename, getNewLine: () => '\n',
  }));
}
const leafletPath = require.resolve('leaflet/dist/leaflet.css');
let leafletCss = await fs.readFile(leafletPath, 'utf8');
leafletCss = leafletCss.replace(/url\((?:"|')?(images\/[^)'"\s]+)(?:"|')?\)/g, (match, filename) => `url(./assets/${path.basename(filename)})`);
const ownCss = sass.compile(path.join(root, 'packages/map/src/styles/index.scss'), { style: 'expanded', silenceDeprecations: ['global-builtin', 'color-functions'] }).css;
const css = postcss.parse(`${leafletCss}\n${ownCss}`);
css.walkDecls((declaration) => {
  if (/assets\/(?:layers(?:-2x)?|marker-icon)\.png/.test(declaration.value)) declaration.parent?.remove();
});
const keyframes = new Map();
css.walkAtRules(/keyframes$/, (rule) => {
  const suffix = rule.params.replace(/(^|[-_])(\w)/g, (match, prefix, character) => character.toUpperCase());
  keyframes.set(rule.params, `map${suffix}`);
  rule.params = `map${suffix}`;
});
css.walkDecls(/animation/, (declaration) => {
  for (const [original, scoped] of keyframes) declaration.value = declaration.value.replace(new RegExp(`\\b${original}\\b`, 'g'), scoped);
});
css.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
  rule.selector = selectorParser((selectors) => selectors.each((selector) => {
    if (selector.toString().trim().startsWith('.mapRoot')) return;
    let rootSelector = false;
    selector.walkClasses((node) => {
      if (node.value === 'leaflet-container') { node.value = 'mapRoot'; rootSelector = true; }
    });
    if (!rootSelector) {
      selector.prepend(selectorParser.combinator({ value: ' ' }));
      selector.prepend(selectorParser.className({ value: 'mapRoot' }));
    }
  })).processSync(rule.selector);
});
const output = path.join(root, 'packages/map/dist');
await fs.writeFile(path.join(output, 'style.css'), css.toString());
await fs.cp(path.join(root, 'packages/map/src/styles/assets'), path.join(output, 'assets'), { recursive: true });
const widgetCss = sass.compile(path.join(root, 'packages/sdk/src/style.scss'), { style: 'expanded' }).css;
const widgetStyles = postcss.parse(widgetCss);
widgetStyles.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
  rule.selector = selectorParser((selectors) => selectors.each((selector) => {
    if (selector.toString().trim().startsWith('.oemWidget')) return;
    selector.prepend(selectorParser.combinator({ value: ' ' }));
    selector.prepend(selectorParser.className({ value: 'oemWidget' }));
  })).processSync(rule.selector);
});
await fs.writeFile(path.join(root, 'packages/sdk/dist/style.css'), `${css.toString()}\n${widgetStyles.toString()}`);
await fs.cp(path.join(output, 'assets'), path.join(root, 'packages/sdk/dist/assets'), { recursive: true });
console.log('Built ESM, declarations and namespaced CSS for core/map/sdk/react.');
