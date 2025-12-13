import neostandard from 'neostandard'
import gitignore from 'eslint-config-flat-gitignore'

export default [
  gitignore(),
  ...neostandard({
    ts: true,
    filesTs: ['**/*.ts', '**/*.mts'],
  })
]
