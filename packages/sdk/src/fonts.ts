import { resolveOEMAsset } from '@opendfieldmap/core';
import type { OEMManifest, OEMResources } from '@opendfieldmap/core';

const FONT_FAMILIES = new Set([
  'HMSans_EN',
  'Novecento Bold',
  'Novecento DemiBold',
  'Novecento Medium',
  'Novecento Cyrillic DemiBold',
  'Novecento Cyrillic Medium',
  'Novecento Vietnamese DemiBold',
  'Novecento Vietnamese Medium',
]);

export const installFonts = (root: HTMLElement, manifest: OEMManifest, resources: OEMResources): void => {
  if (!manifest.fonts?.length) return;
  const rules = manifest.fonts.map((font) => {
    if (!FONT_FAMILIES.has(font.family) || !Number.isFinite(font.weight) ||
      (font.weightRange && (!Number.isFinite(font.weightRange[0]) || !Number.isFinite(font.weightRange[1]) ||
        font.weightRange[0] > font.weightRange[1]))) {
      throw new Error(`Unsupported OEM font: ${font.family}`);
    }
    const url = resolveOEMAsset(resources.baseUrl, font.path);
    const weight = font.weightRange ? `${font.weightRange[0]} ${font.weightRange[1]}` : String(font.weight);
    return `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(url)}) format("woff2");font-style:${font.style};font-weight:${weight};font-display:swap;}`;
  });
  const style = document.createElement('style');
  style.dataset.oemFonts = manifest.releaseId;
  style.textContent = rules.join('');
  root.append(style);
};
