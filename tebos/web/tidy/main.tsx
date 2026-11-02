// Tidy Enterprise's public website: its own web app (vite.tidy.config.ts), built and deployed apart from TEBOS. ADR 0022.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TidyApp } from "../src/tidy/TidyApp";
import "@fontsource-variable/geist";
import "../src/tidy/tidy.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TidyApp />
  </StrictMode>,
);
