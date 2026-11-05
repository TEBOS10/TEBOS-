// Tidy Property Operations: its own web app, built and deployed apart from TEBOS, TEPOS and the PRA platform
// (vite.ops.config.ts). It shares the domain rules and the database; its accounts are its own. ADR 0023.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OpsApp } from "../src/ops/OpsApp";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "../src/styles.css";
import "../src/ops/tokens.css";
import "../src/ops/ops.css";
import { applyTheme, followSystemTheme } from "../src/ops/theme";

// the reader's theme, before the first paint
applyTheme();
followSystemTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OpsApp />
  </StrictMode>,
);
