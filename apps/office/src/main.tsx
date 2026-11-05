import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installBrowserKeyBlock } from "@gokul/ui";
import "@gokul/ui/theme.css";
import { App } from "./App";

// Reload, print, find, zoom and friends must never reach the page (an open form would be lost).
installBrowserKeyBlock({ dev: import.meta.env.DEV });

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
