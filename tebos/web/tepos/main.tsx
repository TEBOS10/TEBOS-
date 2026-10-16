// TEPOS, the Tidy Enterprise Personal Operating System: the founder's own web app, built and deployed apart from
// TEBOS (vite.tepos.config.ts). It shares TEBOS's domain rules and database; its data sits in private organisations.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TeposApp } from "../src/tepos/TeposApp";
import "../src/styles.css";
import "../src/tepos/tepos.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TeposApp />
  </StrictMode>,
);
