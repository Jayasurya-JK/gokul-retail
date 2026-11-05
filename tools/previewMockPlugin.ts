// Vite plugin for the dev-only browser preview (`npm run preview:office` / `preview:pos`).
// In mode "preview-mock" it swaps each app's `src/api.ts` (the only file that talks to Tauri)
// for `src/api.mock.ts`, a stateful in-memory fake. In every other mode it does nothing, and in
// a production build it refuses to run at all, so the fake cannot be shipped by accident.
import type { Plugin } from "vite";

export const PREVIEW_MODE = "preview-mock";

export function previewMock(mode: string, command: "build" | "serve", appTitle: string): Plugin | null {
  if (mode !== PREVIEW_MODE) return null;
  if (command !== "serve") {
    throw new Error(`Mode "${PREVIEW_MODE}" is dev-only and cannot be used with "vite build". The mock must never be shipped.`);
  }
  return {
    name: "gokul-preview-mock",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (source !== "./api" || !importer) return null;
      const real = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!real || !/[\\/]src[\\/]api\.ts$/.test(real.id)) return null;
      return real.id.replace(/api\.ts$/, "api.mock.ts");
    },
    transformIndexHtml(html) {
      const ribbon =
        '<div style="position:fixed;right:0;bottom:0;z-index:99999;background:#b00020;color:#fff;font:600 11px/1 sans-serif;padding:4px 8px;opacity:.9;pointer-events:none">' +
        `PREVIEW MOCK - ${appTitle} - not real data</div>`;
      return html.replace("</body>", `${ribbon}</body>`).replace(/<title>(.*?)<\/title>/, "<title>[MOCK] $1</title>");
    },
  };
}
