// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/out/**',
      'src/test/extension.test.ts', // On exclut le test VS Code
    ],
  },
})