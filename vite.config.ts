import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const devStylesId = '\0oem-sdk-dev-styles';
const rawSvgDirectories = [
  resolve(root, 'packages/map/src/assets'),
  resolve(root, 'packages/sdk/src/assets'),
];

export default defineConfig(({ command }) => {
  const serve = command === 'serve';
  return {
    base: './',
    plugins: serve ? [
      {
        name: 'oem-sdk-dev-svg-source',
        enforce: 'pre',
        async load(id) {
          const file = id.split('?')[0];
          if (!file.endsWith('.svg') || !rawSvgDirectories.some((directory) => file.startsWith(`${directory}/`))) {
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
        load(id) {
          if (id !== devStylesId) return undefined;
          return [
            `import ${JSON.stringify(resolve(root, 'packages/map/node_modules/leaflet/dist/leaflet.css'))};`,
            `import ${JSON.stringify(resolve(root, 'packages/map/src/styles/index.scss'))};`,
            `import ${JSON.stringify(resolve(root, 'packages/sdk/src/style.scss'))};`,
          ].join('\n');
        },
      },
    ] : [],
    resolve: serve ? {
      alias: [
        { find: /^@opendfieldmap\/core$/, replacement: resolve(root, 'packages/core/src/index.ts') },
        { find: /^@opendfieldmap\/map$/, replacement: resolve(root, 'packages/map/src/index.ts') },
        { find: /^@opendfieldmap\/sdk$/, replacement: resolve(root, 'packages/sdk/src/index.ts') },
        { find: /^@opendfieldmap\/react$/, replacement: resolve(root, 'packages/react/src/index.tsx') },
      ],
    } : undefined,
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
