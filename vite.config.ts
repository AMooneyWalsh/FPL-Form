import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app lives in app/ because the old site still owns the root index.html.
export default defineConfig({
  root: "app",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787" } },
  test: {
    root: ".",
    include: ["shared/**/*.test.ts", "worker/**/*.test.ts"],
  },
});
