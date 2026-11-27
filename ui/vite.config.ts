import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Loaded by the Tauri WKWebView (macOS 14+): devUrl http://localhost:1420, frontendDist ui/dist (#19).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  clearScreen: false,
  envPrefix: "HARVEY_",
  server: {
    port: 1420,
    strictPort: true,
    fs: {
      // Tokens are imported from brand/ (single source, spec §8.1); fonts come from the workspace node_modules.
      allow: [".", "../brand", "../node_modules"],
    },
  },
  build: {
    target: "safari17",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**"],
      exclude: ["src/bindings.ts", "src/components/ui/**", "src/main.tsx", "src/test/**", "src/**/*.css"],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
});
