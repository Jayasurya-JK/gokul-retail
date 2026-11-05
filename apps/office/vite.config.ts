import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1421, strictPort: true },
  build: { target: "chrome105", outDir: "dist" },
  test: { environment: "jsdom" },
});
