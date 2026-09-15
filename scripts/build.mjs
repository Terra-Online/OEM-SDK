import { compileOEMStyles } from './styles.mjs';
import { build } from 'esbuild';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['core', 'map', 'sdk', 'react']) {
  const directory = path.join(root, `packages/${name}`);
  await fs.rm(path.join(directory, 'dist'), { recursive: true, force: true });
  await build({
    entryPoints: [path.join(directory, `src/index.${name === 'react' ? 'tsx' : 'ts'}`)],
    outdir: path.join(directory, 'dist'),
    bundle: true,
    splitting: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    packages: 'external',
    loader: { '.svg': 'text' },
    tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } },
  });
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile).config;
  delete config.compilerOptions.paths;
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, root, {
    declaration: true,
    emitDeclarationOnly: true,
    rootDir: path.join(directory, 'src'),
    outDir: path.join(directory, 'dist'),
  });
  const files = ts.sys.readDirectory(path.join(directory, 'src'), ['.ts', '.tsx']);
  const program = ts.createProgram(files, parsed.options);
  const result = program.emit();
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
  if (diagnostics.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (filename) => filename,
        getNewLine: () => '\n',
      }),
    );
}
const styles = await compileOEMStyles(root);
for (const [name, css] of [
  ['map', styles.map],
  ['sdk', styles.widget],
]) {
  const output = path.join(root, `packages/${name}/dist`);
  await fs.writeFile(path.join(output, 'style.css'), css);
  await fs.cp(path.join(root, 'packages/map/src/styles/assets'), path.join(output, 'assets'), {
    recursive: true,
  });
}
console.log('Built ESM, declarations and namespaced CSS for core/map/sdk/react.');
