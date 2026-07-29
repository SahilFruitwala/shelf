//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      // Build output and generated code. `.output` was already here; `.vercel`
      // was not, so every `vite build` left ~39 parse errors in the lint report
      // from linting minified bundles that have no tsconfig project.
      '.output/**',
      '.vercel/**',
      '.tanstack/**',
      '.nitro/**',
      'dist/**',
      'src/routeTree.gen.ts',
    ],
  },
]
