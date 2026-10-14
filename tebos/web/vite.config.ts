import react from "@vitejs/plugin-react";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { PUBLIC_PAGES, pageFile, pageHtml, sitemapXml } from "./src/lib/pages";

// After the build: a copy of index.html per public page with its own title,
// description and link-preview tags, and the sitemap from the same list.
// The host serves a page's copy before falling back to the app (vercel.json).
function publicPages(): Plugin {
  let outDir = "dist";
  return {
    name: "tebos-public-pages",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const template = readFileSync(join(outDir, "index.html"), "utf8");
      for (const page of PUBLIC_PAGES) {
        const file = join(outDir, pageFile(page.path));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, pageHtml(template, page));
      }
      writeFileSync(join(outDir, "sitemap.xml"), sitemapXml());
    },
  };
}

// @core points at the TEBOS domain layer (../src/domain), so the interface
// explains and pre-checks rules with the same code the workers use. Only
// browser-safe modules (src/domain) may be imported from here.
export default defineConfig({
  plugins: [react(), publicPages()],
  resolve: {
    alias: { "@core": fileURLToPath(new URL("../src/domain", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } },
  // three.js is only reached through the lazily loaded board world; bundle it
  // up front so the dev server doesn't discover it mid-session and reload.
  optimizeDeps: {
    include: [
      "three",
      "three/addons/renderers/CSS2DRenderer.js",
      "three/addons/postprocessing/EffectComposer.js",
      "three/addons/postprocessing/OutputPass.js",
      "three/addons/postprocessing/RenderPass.js",
      "three/addons/postprocessing/UnrealBloomPass.js",
      "three/addons/environments/RoomEnvironment.js",
      "three/addons/controls/OrbitControls.js",
    ],
  },
});
