import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: ["src/**"],
        exclude: [
          "src/bindings.ts",
          "src/components/ui/**",
          "src/main.tsx",
          "src/test/**",
          "**/*.test.{ts,tsx}",
          "**/*.d.ts",
        ],
        thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
      },
    },
  }),
);
