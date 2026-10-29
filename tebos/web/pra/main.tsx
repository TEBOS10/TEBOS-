// The Property Revenue Architect Platform: its own web app, built and deployed apart from TEBOS and TEPOS
// (vite.pra.config.ts), linked to TEPOS. It shares the domain rules and the database; its accounts are its own.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PraApp } from "../src/pra/PraApp";
import "../src/styles.css";
import "../src/cinematic.css";
import "../src/pra/pra.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PraApp />
  </StrictMode>,
);
