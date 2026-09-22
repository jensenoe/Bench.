import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Sunrise and sunset assertions are written for Oetwil am See.
    env: { TZ: 'Europe/Zurich' }
  }
})
