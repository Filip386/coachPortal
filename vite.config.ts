import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  build: {
    assetsInlineLimit: (filePath) =>
      // Keep every font as a real same-origin file. Vite inlines assets under 4KB as
      // `data:` URIs, which would make the smallest subsets depend on the Power Apps
      // player's `font-src` policy allowing `data:` — and its `img-src`/`style-src` are
      // already restrictive enough that we shouldn't bet on it. Emitted files only need
      // `'self'`. `undefined` keeps Vite's default behaviour for everything else.
      filePath.endsWith(".woff2") ? false : undefined,
  },
});
