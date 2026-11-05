import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { previewMock } from "../../tools/previewMockPlugin.ts";

export default defineConfig(({ mode, command }) => ({
  plugins: [react(), previewMock(mode, command, "Gokul POS")],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "chrome105", outDir: "dist" },
  test: { environment: "jsdom" },
}));
