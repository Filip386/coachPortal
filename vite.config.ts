import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"

const neverInlineFonts = (filePath: string) => (filePath.endsWith(".woff2") ? false : undefined);

export default defineConfig({
  plugins: [react(), powerApps()],
  build: {
    assetsInlineLimit: neverInlineFonts,
  },
});
