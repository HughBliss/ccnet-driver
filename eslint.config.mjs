import { FlatCompat } from '@eslint/eslintrc'
import pluginJs from '@eslint/js'
import globals from 'globals'
import path from 'path'
import tseslint from 'typescript-eslint'
import { fileURLToPath } from 'url'

const fileName = fileURLToPath(import.meta.url)
const dirName = path.dirname(fileName)
const compat = new FlatCompat({
  baseDirectory: dirName,
  recommendedConfig: pluginJs.configs.recommended
})

export default [
  { files: ['**/*.js'], languageOptions: { sourceType: 'script' } },
  { languageOptions: { globals: globals.browser } },
  ...tseslint.configs.recommended,
  ...compat.extends('love')
]
