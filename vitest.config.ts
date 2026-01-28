// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/out/**',
      'src/test/extension.test.ts', 
      'src/test/llmService.test.ts',
    ],
    setupFiles: ['./src/test/setup.ts'],
  },
})