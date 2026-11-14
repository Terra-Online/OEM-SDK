import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Export and diagnostics use the runtime codecs without requiring a package build.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
export const { decodeOEMBehaviors, findOEMBehaviors, gameToOEMPosition, mapToGameXZPosition } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
