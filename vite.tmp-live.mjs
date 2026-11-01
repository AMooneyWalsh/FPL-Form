import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ root: "app", plugins: [react()], server: { port: 5199, proxy: { "/api": { target: "https://draftyinhere.com", changeOrigin: true } } } });
