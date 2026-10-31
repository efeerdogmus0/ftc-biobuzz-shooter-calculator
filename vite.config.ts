import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Relative base works at any subpath (GitHub Pages /<repo>/) including worker
// URLs; CI may pin an absolute base with VITE_BASE=/<repo>/.
export default defineConfig({
  base: process.env.VITE_BASE || "./",
  plugins: [react()],
});
