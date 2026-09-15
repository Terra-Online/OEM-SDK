import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
// @ts-expect-error Shared build script is plain JavaScript.
import { compileOEMStyles } from './scripts/styles.mjs';

const root = import.meta.dirname;
const devStylesId = '\0oem-sdk-dev-styles.css';
const rawSvgDirectories = [
  resolve(root, 'packages/map/src/assets'),
  resolve(root, 'packages/sdk/src/assets'),
];

export default defineConfig(({ command }) => {
  const serve = command === 'serve';
  return {
    base: './',
    plugins: serve
      ? [
          {
            name: 'oem-sdk-dev-svg-source',
            enforce: 'pre',
            async load(id) {
              const file = id.split('?')[0];
              if (
                !file.endsWith('.svg') ||
                !rawSvgDirectories.some((directory) => file.startsWith(`${directory}/`))
              ) {
                return undefined;
              }
              return `export default ${JSON.stringify(await readFile(file, 'utf8'))};`;
            },
          },
          {
            name: 'oem-sdk-dev-styles',
            enforce: 'pre',
            resolveId(source) {
              return source === '@opendfieldmap/sdk/style.css' ? devStylesId : undefined;
            },
            async load(id) {
              if (id !== devStylesId) return undefined;
              const styles = await compileOEMStyles(root);
              this.addWatchFile(resolve(root, 'packages/map/src/styles'));
              this.addWatchFile(resolve(root, 'packages/sdk/src/style.scss'));
              return styles.widget.replaceAll('./assets/', '/packages/map/src/styles/assets/');
            },
            handleHotUpdate(context) {
              if (!context.file.endsWith('.scss')) return;
              if (
                !context.file.includes('/packages/map/src/styles/') &&
                !context.file.endsWith('/packages/sdk/src/style.scss')
              )
                return;
              const module = context.server.moduleGraph.getModuleById(devStylesId);
              if (module) return [module];
            },
          },
        ]
      : [],
    resolve: serve
      ? {
          alias: [
            { find: /^@opendfieldmap\/core$/, replacement: resolve(root, 'packages/core/src/index.ts') },
            { find: /^@opendfieldmap\/map$/, replacement: resolve(root, 'packages/map/src/index.ts') },
            { find: /^@opendfieldmap\/sdk$/, replacement: resolve(root, 'packages/sdk/src/index.ts') },
            { find: /^@opendfieldmap\/react$/, replacement: resolve(root, 'packages/react/src/index.tsx') },
          ],
        }
      : undefined,
    build: {
      outDir: 'dist',
      assetsDir: 'demo/assets',
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: {
          root: resolve(root, 'index.html'),
          demo: resolve(root, 'demo/index.html'),
        },
      },
    },
    server: {
      port: 4173,
      strictPort: false,
      watch: {
        ignored: [
          '**/public/tiles/**',
          '**/public/marker/**',
          '**/public/map/**',
          '**/public/fonts/**',
          '**/public/releases/**',
        ],
      },
    },
  };
});
