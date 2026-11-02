import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_DEV_API_TARGET ?? "http://localhost:5080";

const proxy = {
  "/api": { target: apiTarget, changeOrigin: true },
  "/hubs": { target: apiTarget, changeOrigin: true, ws: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy,
    // Инструменты редактирования создают временные файлы *.tmpdir/*.tmp рядом
    // с целью; chokidar падает на них с EBUSY под Windows — не следим за ними.
    watch: {
      ignored: ["**/*.tmp", "**/*.tmpdir/**", "**/.tmp/**"],
    },
  },
  preview: {
    port: 4173,
    proxy,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 1800,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
