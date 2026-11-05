import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { App } from "./App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("shows the Gokul POS shell with app info", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const loadInfo = () =>
    Promise.resolve({ name: "Gokul POS", version: "0.1.0", schema_version: 1 });
  await act(async () => {
    createRoot(host).render(<App loadInfo={loadInfo} />);
  });
  expect(host.querySelector("h1")?.textContent).toBe("Gokul POS");
  expect(host.textContent).toContain("0.1.0");
});
