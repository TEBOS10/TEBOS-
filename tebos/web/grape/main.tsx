// Grape Studios' booking site: its own web app (vite.grape.config.ts), built and deployed apart from TEBOS. ADR 0016.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GrapeApp } from "../src/grape/GrapeApp";
import "@fontsource-variable/geist";
import "../src/grape/grape.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GrapeApp />
  </StrictMode>,
);
