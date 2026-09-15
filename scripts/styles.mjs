import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as sass from 'sass';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

/** Shared internal styles for development and package builds. */
export async function compileOEMStyles(root) {
const require = createRequire(path.join(root, 'packages/map/package.json'));
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
return { map: css.toString(), widget: `${css.toString()}\n${widgetStyles.toString()}` };
}
