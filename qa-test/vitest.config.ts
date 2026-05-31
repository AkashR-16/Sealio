import { defineConfig } from "vitest/config"
import { loadEnv } from "vite"
import path from "path"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "")
  return {
    test: {
      globals: true,
      environment: "node",
      testTimeout: 30000,
      hookTimeout: 30000,
      env,
    },
  }
})
