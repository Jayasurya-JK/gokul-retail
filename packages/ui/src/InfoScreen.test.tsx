import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { InfoScreen } from "./InfoScreen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(ui);
  });
  return host;
}

describe("InfoScreen", () => {
  it("shows title and app info", async () => {
    const loadInfo = () =>
      Promise.resolve({ name: "Gokul POS", version: "0.1.0", schema_version: 1 });
    const host = await render(<InfoScreen title="Gokul POS" loadInfo={loadInfo} />);
    expect(host.querySelector("h1")?.textContent).toBe("Gokul POS");
    expect(host.textContent).toContain("0.1.0");
    expect(host.textContent).toContain("Data version");
  });

  it("shows a plain error when loading fails", async () => {
    const loadInfo = () => Promise.reject("The data file could not be opened.");
    const host = await render(<InfoScreen title="Gokul Office" loadInfo={loadInfo} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not be opened");
  });
});
