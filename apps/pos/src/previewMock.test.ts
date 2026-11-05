// The preview mock must be impossible to ship: selected only by vite mode "preview-mock", refused
// by `vite build`, and absent from the default production bundle.
import { describe, expect, it } from "vitest";
import { build, createServer } from "vite";

// vitest runs with the app folder as the working directory, so this is the app's own config.
const configFile = "vite.config.ts";
const MARKER = "__GOKUL_PREVIEW_MOCK_7f3a9c__";

async function bundleText(mode?: string): Promise<string> {
  const out = await build({ configFile, mode, logLevel: "silent", build: { write: false, minify: false } });
  const results = Array.isArray(out) ? out : [out];
  const chunks = results.flatMap((r) => ("output" in r ? r.output : []));
  return chunks.map((c) => ("code" in c ? c.code : typeof c.source === "string" ? c.source : "")).join("\n");
}

async function resolvedApi(mode: string): Promise<string | undefined> {
  const server = await createServer({ configFile, mode, logLevel: "silent", server: { middlewareMode: true }, appType: "custom" });
  try {
    const importer = `${server.config.root}/src/App.tsx`;
    return (await server.pluginContainer.resolveId("./api", importer))?.id;
  } finally {
    await server.close();
  }
}

describe("preview mock cannot reach a production bundle", () => {
  it("default production build has real api code and no mock", async () => {
    const text = await bundleText();
    expect(text).toContain("startup_status");
    expect(text).not.toContain(MARKER);
    expect(text).not.toContain("PREVIEW MOCK");
    expect(text).not.toContain("createFakeBackend");
  }, 120_000);

  it("vite build refuses mode preview-mock", async () => {
    await expect(bundleText("preview-mock")).rejects.toThrow(/dev-only/);
  }, 60_000);

  it("a production-mode build explicitly named production has no mock either", async () => {
    expect(await bundleText("production")).not.toContain(MARKER);
  }, 120_000);

  it("only mode preview-mock swaps api.ts for api.mock.ts in the dev server", async () => {
    expect(await resolvedApi("preview-mock")).toMatch(/src[\\/]api\.mock\.ts$/);
    expect(await resolvedApi("development")).toMatch(/src[\\/]api\.ts$/);
  }, 60_000);
});
