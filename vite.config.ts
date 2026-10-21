import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = Number(process.env.PORT ?? 4848);

export default defineConfig({
  root: "src/client",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
  build: {
    outDir: path.resolve("dist/client"),
    emptyOutDir: true,
  },
});
