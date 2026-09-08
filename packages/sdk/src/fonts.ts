import { resolveOEMAsset } from '@opendfieldmap/core';
import type { OEMManifest, OEMResources } from '@opendfieldmap/core';

const FONT_FAMILIES = new Set(['Novecento Bold', 'Novecento DemiBold', 'Novecento Medium']);

export const installFonts = (root: HTMLElement, manifest: OEMManifest, resources: OEMResources): void => {
  if (!manifest.fonts?.length) return;
  const rules = manifest.fonts.map((font) => {
    if (!FONT_FAMILIES.has(font.family) || !Number.isFinite(font.weight)) throw new Error(`Unsupported OEM font: ${font.family}`);
    const url = resolveOEMAsset(resources.baseUrl, font.path);
    return `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(url)}) format("woff2");font-style:normal;font-display:swap;}`;
  });
  const style = document.createElement('style');
  style.dataset.oemFonts = manifest.releaseId;
  style.textContent = rules.join('');
  root.append(style);
};
