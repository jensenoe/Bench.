import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import stylistic from '@stylistic/eslint-plugin'

/** House style: no semicolons, single quotes, two spaces, module-scope components. */
const style = {
  '@stylistic/semi': ['error', 'never'],
  '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
  '@stylistic/indent': ['error', 2, { SwitchCase: 1, flatTernaryExpressions: true, ignoredNodes: ['JSXElement *', 'JSXElement', 'ConditionalExpression'] }],
  '@stylistic/jsx-quotes': ['error', 'prefer-double'],
  '@stylistic/no-trailing-spaces': 'error',
  '@stylistic/eol-last': ['error', 'always'],
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-empty': ['error', { allowEmptyCatch: true }]
}

export default [
  { ignores: ['dist/**', 'release/**', 'node_modules/**', 'build/**', 'public/**', 'data/**', 'backups/**'] },
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'scripts/**/*.mjs', 'electron/**/*.cjs', 'vite.config.js', 'vitest.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    plugins: { '@stylistic': stylistic },
    rules: style
  },
  {
    files: ['electron/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    plugins: { '@stylistic': stylistic },
    rules: style
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024, sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    },
    plugins: { react, 'react-hooks': reactHooks, '@stylistic': stylistic },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...style,
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',   // the copy is full of apostrophes on purpose
      'react/no-unknown-property': ['error', { ignore: ['fetchpriority'] }],
      // React Compiler era rules: worth reading, not worth blocking a commit over in this codebase
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      // Components defined inside a render remount their children and replay animations. Bit us three times.
      'react/no-unstable-nested-components': 'error'
    }
  }
]
