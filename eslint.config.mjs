import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'public/**',
      'artifacts/**',
      'scripts/bench/**',
      'packages/map/src/atlos/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
    },
  },
  { files: ['tests/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  prettier,
];
